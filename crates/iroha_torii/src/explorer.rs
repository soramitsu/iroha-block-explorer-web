#![cfg(feature = "app_api")]

use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};

use iroha_core::state::WorldReadOnly;
use iroha_data_model::{
    account::{AccountAddress, AccountEntry, AccountId},
    asset::{AssetDefinition, AssetDefinitionId, AssetEntry, Mintable},
    block::SignedBlock,
    domain::{Domain, DomainId},
    metadata::Metadata,
    nft::NftEntry,
};
use norito::json::{self, Map, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::json_macros::{JsonDeserialize, JsonSerialize};

const NETWORK_PREFIX: u16 = 42;

#[derive(Debug, Clone, Default)]
pub(crate) struct ExplorerAggregates {
    account_counters: BTreeMap<AccountId, AccountCounters>,
    domain_counters: BTreeMap<DomainId, DomainCounters>,
    definition_instances: BTreeMap<AssetDefinitionId, u32>,
    definition_holders: BTreeMap<AssetDefinitionId, BTreeSet<AccountId>>,
}

#[derive(Debug, Clone, Copy, Default)]
struct AccountCounters {
    owned_domains: u32,
    owned_assets: u32,
    owned_nfts: u32,
}

#[derive(Debug, Clone, Copy, Default)]
struct DomainCounters {
    accounts: u32,
    assets: u32,
    nfts: u32,
}

impl ExplorerAggregates {
    pub(crate) fn build(world: &impl WorldReadOnly) -> Self {
        let mut agg = Self::default();

        for account in world.accounts_iter() {
            let entry = agg
                .domain_counters
                .entry(account.id().domain().clone())
                .or_default();
            entry.accounts = entry.accounts.saturating_add(1);
            agg.account_counters
                .entry(account.id().clone())
                .or_default();
        }

        for domain in world.domains_iter() {
            let entry = agg
                .account_counters
                .entry(domain.owned_by().clone())
                .or_default();
            entry.owned_domains = entry.owned_domains.saturating_add(1);
            agg.domain_counters
                .entry(domain.id().clone())
                .or_default();
        }

        for asset in world.assets_iter() {
            let account_id = asset.id().account().clone();
            let definition_id = asset.id().definition().clone();
            let domain_id = asset.id().definition().domain().clone();

            let account_entry = agg.account_counters.entry(account_id.clone()).or_default();
            account_entry.owned_assets = account_entry.owned_assets.saturating_add(1);

            let domain_entry = agg.domain_counters.entry(domain_id).or_default();
            domain_entry.assets = domain_entry.assets.saturating_add(1);

            *agg.definition_instances.entry(definition_id.clone()).or_default() += 1;
            agg.definition_holders
                .entry(definition_id)
                .or_default()
                .insert(account_id);
        }

        for (nft_id, nft) in world.nfts().iter() {
            let owner_entry = agg.account_counters.entry(nft.owned_by.clone()).or_default();
            owner_entry.owned_nfts = owner_entry.owned_nfts.saturating_add(1);

            let domain_entry = agg
                .domain_counters
                .entry(nft_id.domain().clone())
                .or_default();
            domain_entry.nfts = domain_entry.nfts.saturating_add(1);
        }

        agg
    }

    pub(crate) fn account_counters(&self, id: &AccountId) -> AccountCounters {
        self.account_counters.get(id).copied().unwrap_or_default()
    }

    pub(crate) fn domain_counters(&self, id: &DomainId) -> DomainCounters {
        self.domain_counters.get(id).copied().unwrap_or_default()
    }

    pub(crate) fn definition_instance_count(&self, id: &AssetDefinitionId) -> u32 {
        self.definition_instances.get(id).copied().unwrap_or(0)
    }

    pub(crate) fn account_holds_definition(
        &self,
        definition: &AssetDefinitionId,
        account: &AccountId,
    ) -> bool {
        self.definition_holders
            .get(definition)
            .map_or(false, |holders| holders.contains(account))
    }
}

#[derive(
    Clone,
    Debug,
    JsonSerialize,
    JsonDeserialize,
    norito::NoritoSerialize,
    norito::NoritoDeserialize,
)]
pub(crate) struct ExplorerPaginationQuery {
    #[norito(default = "default_page")]
    pub page: u64,
    #[norito(default = "default_per_page")]
    pub per_page: u64,
}

impl Default for ExplorerPaginationQuery {
    fn default() -> Self {
        Self {
            page: default_page(),
            per_page: default_per_page(),
        }
    }
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerPaginationMeta {
    pub page: u64,
    pub per_page: u64,
    pub total_pages: u64,
    pub total_items: u64,
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerAccountDto {
    pub id: String,
    pub ih58_address: String,
    pub compressed_address: String,
    pub network_prefix: u16,
    pub metadata: Value,
    pub owned_domains: u32,
    pub owned_assets: u32,
    pub owned_nfts: u32,
}

impl ExplorerAccountDto {
    pub(crate) fn from_entry(entry: AccountEntry<'_>, counts: AccountCounters) -> Self {
        let address =
            AccountAddress::from_account_id(entry.id()).expect("account ids are always valid");
        Self {
            id: entry.id().to_string(),
            ih58_address: address
                .to_ih58(NETWORK_PREFIX)
                .unwrap_or_else(|_| entry.id().to_string()),
            compressed_address: address
                .to_compressed_sora()
                .unwrap_or_else(|_| entry.id().to_string()),
            network_prefix: NETWORK_PREFIX,
            metadata: metadata_to_json(entry.value().metadata()),
            owned_domains: counts.owned_domains,
            owned_assets: counts.owned_assets,
            owned_nfts: counts.owned_nfts,
        }
    }
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerAccountsPage {
    pub pagination: ExplorerPaginationMeta,
    pub items: Vec<ExplorerAccountDto>,
}

pub(crate) fn paginate<T>(
    mut items: Vec<T>,
    page: u64,
    per_page: u64,
) -> (Vec<T>, ExplorerPaginationMeta) {
    let per_page = per_page.max(1);
    let total_items = items.len() as u64;
    let total_pages = if total_items == 0 {
        0
    } else {
        (total_items + per_page - 1) / per_page
    };
    let start = (page.saturating_sub(1)).saturating_mul(per_page).min(total_items) as usize;
    if start > 0 {
        items.drain(0..start);
    }
    if items.len() > per_page as usize {
        items.truncate(per_page as usize);
    }
    (
        items,
        ExplorerPaginationMeta {
            page,
            per_page,
            total_pages,
            total_items,
        },
    )
}

pub(crate) fn metadata_to_json(metadata: &Metadata) -> Value {
    metadata
        .clone()
        .try_into_any_norito::<Value>()
        .unwrap_or_else(|_| Value::Object(Map::new()))
}

const fn default_page() -> u64 {
    1
}

const fn default_per_page() -> u64 {
    10
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerDomainDto {
    pub id: String,
    pub logo: Option<String>,
    pub metadata: Value,
    pub owned_by: String,
    pub accounts: u32,
    pub assets: u32,
    pub nfts: u32,
}

impl ExplorerDomainDto {
    pub(crate) fn from_domain(domain: &Domain, counts: DomainCounters) -> Self {
        Self {
            id: domain.id().to_string(),
            logo: domain.logo().map(|logo| logo.to_string()),
            metadata: metadata_to_json(domain.metadata()),
            owned_by: domain.owned_by().to_string(),
            accounts: counts.accounts,
            assets: counts.assets,
            nfts: counts.nfts,
        }
    }
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerDomainsPage {
    pub pagination: ExplorerPaginationMeta,
    pub items: Vec<ExplorerDomainDto>,
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerAssetDefinitionDto {
    pub id: String,
    pub mintable: String,
    pub logo: Option<String>,
    pub metadata: Value,
    pub owned_by: String,
    pub assets: u32,
}

impl ExplorerAssetDefinitionDto {
    pub(crate) fn from_definition(
        definition: &AssetDefinition,
        aggregates: &ExplorerAggregates,
    ) -> Self {
        Self {
            id: definition.id().to_string(),
            mintable: mintable_label(definition.mintable()),
            logo: definition.logo().map(|logo| logo.to_string()),
            metadata: metadata_to_json(definition.metadata()),
            owned_by: definition.owned_by().to_string(),
            assets: aggregates.definition_instance_count(definition.id()),
        }
    }
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerAssetDefinitionsPage {
    pub pagination: ExplorerPaginationMeta,
    pub items: Vec<ExplorerAssetDefinitionDto>,
}

fn mintable_label(mintable: Mintable) -> String {
    match mintable {
        Mintable::Infinitely => "Infinitely",
        Mintable::Once => "Once",
        Mintable::Not => "Not",
    }
    .to_string()
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerAssetDto {
    pub id: String,
    pub definition_id: String,
    pub account_id: String,
    pub value: String,
}

impl ExplorerAssetDto {
    pub(crate) fn from_entry(entry: AssetEntry<'_>) -> Self {
        Self {
            id: entry.id().to_string(),
            definition_id: entry.id().definition().to_string(),
            account_id: entry.id().account().to_string(),
            value: entry.value().as_ref().to_string(),
        }
    }
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerAssetsPage {
    pub pagination: ExplorerPaginationMeta,
    pub items: Vec<ExplorerAssetDto>,
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerNftDto {
    pub id: String,
    pub owned_by: String,
    pub metadata: Value,
}

impl ExplorerNftDto {
    pub(crate) fn from_entry(entry: NftEntry<'_>) -> Self {
        Self {
            id: entry.id().to_string(),
            owned_by: entry.value().owned_by.to_string(),
            metadata: metadata_to_json(&entry.value().content),
        }
    }
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerNftsPage {
    pub pagination: ExplorerPaginationMeta,
    pub items: Vec<ExplorerNftDto>,
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerBlockDto {
    pub hash: String,
    pub height: u64,
    pub created_at: String,
    pub prev_block_hash: Option<String>,
    pub transactions_hash: Option<String>,
    pub transactions_rejected: u32,
    pub transactions_total: u32,
}

impl ExplorerBlockDto {
    pub(crate) fn from_block(block: &SignedBlock) -> Self {
        let header = block.header();
        let external_total = block.external_transactions().len();
        Self {
            hash: block.hash().to_string(),
            height: header.height().get(),
            created_at: block_created_at(header.creation_time()),
            prev_block_hash: header.prev_block_hash().map(|hash| hash.to_string()),
            transactions_hash: header.merkle_root().map(|hash| hash.to_string()),
            transactions_rejected: count_rejected_transactions(block, external_total),
            transactions_total: saturating_usize_to_u32(external_total),
        }
    }
}

#[derive(Clone, Debug, JsonSerialize, norito::NoritoSerialize, norito::NoritoDeserialize)]
pub(crate) struct ExplorerBlocksPage {
    pub pagination: ExplorerPaginationMeta,
    pub items: Vec<ExplorerBlockDto>,
}

fn block_created_at(duration: Duration) -> String {
    const FALLBACK: &str = "1970-01-01T00:00:00Z";
    let nanos = i128::from(duration.as_secs())
        .saturating_mul(1_000_000_000)
        .saturating_add(i128::from(duration.subsec_nanos()));
    let datetime = OffsetDateTime::from_unix_timestamp_nanos(nanos)
        .unwrap_or(OffsetDateTime::UNIX_EPOCH);
    datetime
        .format(&Rfc3339)
        .unwrap_or_else(|_| FALLBACK.to_string())
}

fn count_rejected_transactions(block: &SignedBlock, external_total: usize) -> u32 {
    if external_total == 0 || !block.has_results() {
        return 0;
    }
    let rejected = block
        .results()
        .take(external_total)
        .filter(|result| result.as_ref().is_err())
        .count();
    saturating_usize_to_u32(rejected)
}

fn saturating_usize_to_u32(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{iter, str::FromStr};
    use iroha_data_model::{
        ChainId,
        block::{
            BlockHeader,
            builder::BlockBuilder,
        },
        asset::{definition::AssetDefinitionId, id::AssetId},
        domain::DomainId,
        metadata::Metadata,
        nft::{NftData, NftId},
        transaction::{
            error::{TransactionRejectionReason, ValidationFail},
            signed::{TransactionBuilder, TransactionResultInner},
        },
        common::{Owned, Ref},
    };
    use iroha_primitives::numeric::Numeric;
    use iroha_test_samples::{ALICE_ID, ALICE_KEYPAIR};
    use nonzero_ext::nonzero;

    #[test]
    fn paginate_truncates_correctly() {
        let items = vec![1, 2, 3, 4, 5];
        let (page, meta) = paginate(items, 2, 2);
        assert_eq!(page, vec![3, 4]);
        assert_eq!(meta.page, 2);
        assert_eq!(meta.per_page, 2);
        assert_eq!(meta.total_items, 5);
        assert_eq!(meta.total_pages, 3);
    }

    #[test]
    fn metadata_conversion_handles_entries() {
        let mut metadata = Metadata::default();
        metadata
            .insert("key".parse().unwrap(), json::Value::String("value".into()))
            .expect("insert metadata");
        let value = metadata_to_json(&metadata);
        match value {
            Value::Object(map) => {
                assert_eq!(map.get("key").and_then(Value::as_str), Some("value"));
            }
            _ => panic!("metadata should serialize into an object"),
        }
    }

    #[test]
    fn mintable_label_matches_variants() {
        assert_eq!(mintable_label(Mintable::Infinitely), "Infinitely");
        assert_eq!(mintable_label(Mintable::Once), "Once");
        assert_eq!(mintable_label(Mintable::Not), "Not");
    }

    #[test]
    fn domain_dto_reflects_counts() {
        let mut domain = iroha_data_model::domain::Domain::new(
            DomainId::from_str("test").expect("domain name"),
        )
        .build(&ALICE_ID);
        domain.metadata_mut().insert(
            "label".parse().unwrap(),
            json::Value::String("value".into()),
        );
        let counts = DomainCounters {
            accounts: 2,
            assets: 3,
            nfts: 4,
        };
        let dto = ExplorerDomainDto::from_domain(&domain, counts);
        assert_eq!(dto.accounts, 2);
        assert_eq!(dto.assets, 3);
        assert_eq!(dto.nfts, 4);
        assert_eq!(dto.owned_by, ALICE_ID.to_string());
    }

    #[test]
    fn asset_definition_dto_contains_metadata() {
        let def_id: AssetDefinitionId = "rose#wonderland".parse().expect("definition id");
        let mut definition =
            iroha_data_model::asset::definition::AssetDefinition::numeric(def_id.clone())
                .build(&ALICE_ID);
        definition.set_mintable(Mintable::Once);
        definition.metadata_mut().insert(
            "ticker".parse().unwrap(),
            json::Value::String("ROSE".into()),
        );
        let mut aggregates = ExplorerAggregates::default();
        aggregates.definition_instances.insert(def_id.clone(), 7);
        let dto = ExplorerAssetDefinitionDto::from_definition(&definition, &aggregates);
        assert_eq!(dto.mintable, "Once");
        assert_eq!(dto.assets, 7);
        assert_eq!(dto.owned_by, ALICE_ID.to_string());
    }

    #[test]
    fn asset_dto_formats_value() {
        let def_id: AssetDefinitionId = "rose#wonderland".parse().expect("definition id");
        let asset_id = AssetId::new(def_id, ALICE_ID.clone());
        let value = Owned::new(Numeric::from(42u32));
        let entry = Ref::new(&asset_id, &value);
        let dto = ExplorerAssetDto::from_entry(entry);
        assert_eq!(dto.id, asset_id.to_string());
        assert_eq!(dto.value, "42");
        assert_eq!(dto.account_id, ALICE_ID.to_string());
    }

    #[test]
    fn nft_dto_includes_metadata() {
        let nft_id: NftId = "rose$wonderland".parse().expect("nft id");
        let mut data = NftData {
            content: Metadata::default(),
            owned_by: ALICE_ID.clone(),
        };
        data.content
            .insert("artist".parse().unwrap(), json::Value::String("Alice".into()));
        let value = Owned::new(data);
        let entry = Ref::new(&nft_id, &value);
        let dto = ExplorerNftDto::from_entry(entry);
        assert_eq!(dto.id, nft_id.to_string());
        assert_eq!(dto.owned_by, ALICE_ID.to_string());
        match dto.metadata {
            Value::Object(map) => assert_eq!(map.get("artist").and_then(Value::as_str), Some("Alice")),
            _ => panic!("metadata should be object"),
        }
    }

    #[test]
    fn block_dto_counts_rejections() {
        let chain: ChainId = "test-chain".parse().expect("valid chain id");
        let tx = TransactionBuilder::new(chain, ALICE_ID.clone())
            .with_instructions(iter::empty::<iroha_data_model::isi::InstructionBox>())
            .sign(ALICE_KEYPAIR.private_key());
        let header = BlockHeader::new(
            nonzero!(3_u64),
            None,
            None,
            None,
            1_700_000_000_000,
            0,
        );
        let mut builder = BlockBuilder::new(header);
        builder.push_transaction(tx);
        builder.push_result(TransactionResultInner::Err(
            TransactionRejectionReason::Validation(ValidationFail::InternalError(
                "boom".to_string(),
            )),
        ));
        let block = builder.build_with_signature(0, ALICE_KEYPAIR.private_key());

        let dto = ExplorerBlockDto::from_block(&block);
        assert_eq!(dto.height, 3);
        assert_eq!(dto.transactions_total, 1);
        assert_eq!(dto.transactions_rejected, 1);
        assert_eq!(dto.created_at, "2023-11-14T22:13:20Z");
        assert!(dto.transactions_hash.is_some());
    }

    #[test]
    fn timestamp_format_handles_epoch() {
        let formatted = block_created_at(Duration::from_millis(0));
        assert_eq!(formatted, "1970-01-01T00:00:00Z");
    }

    #[test]
    fn pagination_query_default_matches_helpers() {
        let query = ExplorerPaginationQuery::default();
        assert_eq!(query.page, default_page());
        assert_eq!(query.per_page, default_per_page());
    }
}
