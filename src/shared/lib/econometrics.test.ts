import { describe, expect, it } from 'vitest';
import BigNumber from 'bignumber.js';
import {
  concentrationTopN,
  computeSetChurn,
  extractAssetDefinitionIdFromTransferPayload,
  extractAssetDefinitionIdFromIsiPayload,
  extractAmountFromIsiPayload,
  extractTransferAmountFromPayload,
  giniCoefficient,
  herfindahlIndex,
  lorenzCurvePoints,
  median,
  nakamotoCoefficient,
  nearestRankQuantile,
  quantile,
  shannonEntropy,
  theilIndexT,
  normalizedEntropy,
  effectiveNumberFromEntropy,
} from './econometrics';

const SAMPLE_I105 =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';
const SAMPLE_ASSET_ID = `${SAMPLE_ASSET_DEFINITION_ID}#${SAMPLE_I105}`;

describe('econometrics', () => {
  it('computes gini coefficient', () => {
    expect(giniCoefficient([new BigNumber(1), new BigNumber(1), new BigNumber(1)])).toBe(0);
    expect(giniCoefficient([new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)])).toBeCloseTo(
      0.75,
      8
    );
    expect(giniCoefficient([new BigNumber(1), new BigNumber(2), new BigNumber(3)])).toBeCloseTo(0.2222222, 6);
  });

  it('computes HHI and concentration ratios', () => {
    expect(herfindahlIndex([new BigNumber(1), new BigNumber(1), new BigNumber(1), new BigNumber(1)])).toBeCloseTo(
      0.25,
      8
    );
    expect(herfindahlIndex([new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)])).toBeCloseTo(
      1,
      8
    );

    expect(concentrationTopN([new BigNumber(1), new BigNumber(1), new BigNumber(1), new BigNumber(1)], 1)).toBeCloseTo(
      0.25,
      8
    );
    expect(concentrationTopN([new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)], 1)).toBeCloseTo(
      1,
      8
    );
  });

  it('computes median and quantiles', () => {
    expect(median([new BigNumber(1), new BigNumber(3), new BigNumber(2)])?.toNumber()).toBe(2);
    expect(median([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)])?.toNumber()).toBe(2.5);

    expect(quantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 0)?.toNumber()).toBe(1);
    expect(quantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 1)?.toNumber()).toBe(4);
    expect(quantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 0.5)?.toNumber()).toBe(
      2.5
    );

    expect(nearestRankQuantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 0)?.toNumber()).toBe(
      1
    );
    expect(nearestRankQuantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 1)?.toNumber()).toBe(
      4
    );
    expect(
      nearestRankQuantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 0.5)?.toNumber()
    ).toBe(2);
    expect(nearestRankQuantile([new BigNumber(1), new BigNumber(100)], 0.9)?.toNumber()).toBe(100);
    expect(nearestRankQuantile([new BigNumber(1), new BigNumber(100)], 0.99)?.toNumber()).toBe(100);
  });

  it('extracts asset definition id from transfer payload', () => {
    expect(extractAssetDefinitionIdFromTransferPayload({ object: SAMPLE_ASSET_ALIAS })).toBe(SAMPLE_ASSET_ALIAS);
    expect(extractAssetDefinitionIdFromTransferPayload({ object: SAMPLE_ASSET_ID })).toBe(SAMPLE_ASSET_DEFINITION_ID);
    expect(extractAssetDefinitionIdFromTransferPayload({ object: { definition: SAMPLE_ASSET_DEFINITION_ID } })).toBe(
      SAMPLE_ASSET_DEFINITION_ID
    );
    expect(extractAssetDefinitionIdFromTransferPayload({ object: { definition_id: SAMPLE_ASSET_ALIAS } })).toBe(
      SAMPLE_ASSET_ALIAS
    );
    expect(extractAssetDefinitionIdFromTransferPayload({ object: { name: 'usd', domain: 'issuer.main' } })).toBe(
      SAMPLE_ASSET_ALIAS
    );
    expect(extractAssetDefinitionIdFromTransferPayload({ nope: true })).toBeNull();
  });

  it('extracts transfer amounts from transfer payload', () => {
    expect(extractTransferAmountFromPayload({ value: '10' })?.toString()).toBe('10');
    expect(extractTransferAmountFromPayload({ amount: 42 })?.toString()).toBe('42');
    expect(extractTransferAmountFromPayload({ value: { numeric: '0.5' } })?.toString()).toBe('0.5');
    expect(extractTransferAmountFromPayload({})).toBeNull();
  });

  it('computes entropy/theil metrics', () => {
    const equal = [new BigNumber(1), new BigNumber(1), new BigNumber(1), new BigNumber(1)];
    expect(theilIndexT(equal)).toBeCloseTo(0, 12);
    expect(shannonEntropy(equal)).toBeCloseTo(Math.log(4), 12);
    expect(normalizedEntropy(equal)).toBeCloseTo(1, 12);
    expect(effectiveNumberFromEntropy(shannonEntropy(equal))).toBeCloseTo(4, 10);

    const concentrated = [new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)];
    expect(shannonEntropy(concentrated)).toBeCloseTo(0, 12);
    expect(normalizedEntropy(concentrated)).toBeCloseTo(0, 12);
    expect(theilIndexT(concentrated)).toBeCloseTo(Math.log(4), 8);
  });

  it('computes Nakamoto coefficient for common thresholds', () => {
    const equal = [new BigNumber(100), new BigNumber(100)];
    expect(nakamotoCoefficient(equal, 0.33)).toBe(1);
    expect(nakamotoCoefficient(equal, 0.51)).toBe(2);
    expect(nakamotoCoefficient(equal, 0.67)).toBe(2);

    const concentrated = [new BigNumber(1), new BigNumber(100)];
    expect(nakamotoCoefficient(concentrated, 0.33)).toBe(1);
    expect(nakamotoCoefficient(concentrated, 0.51)).toBe(1);
    expect(nakamotoCoefficient(concentrated, 0.67)).toBe(1);
  });

  it('computes Lorenz curve points', () => {
    const values = [new BigNumber(1), new BigNumber(1), new BigNumber(1), new BigNumber(1)];
    const points = lorenzCurvePoints(values, 4);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ population: 0, share: 0 });
    expect(points[4]).toEqual({ population: 1, share: 1 });
    expect(points[1]!.share).toBeCloseTo(0.25, 10);
    expect(points[2]!.share).toBeCloseTo(0.5, 10);
    expect(points[3]!.share).toBeCloseTo(0.75, 10);

    const concentrated = lorenzCurvePoints([new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)], 4);
    expect(concentrated[3]!.share).toBeCloseTo(0, 10);
    expect(concentrated[4]!.share).toBeCloseTo(1, 10);
  });

  it('computes set churn', () => {
    const churn = computeSetChurn(['a', 'b', 'c'], ['b', 'c', 'd', 'd']);
    expect(churn.previous).toBe(3);
    expect(churn.current).toBe(3);
    expect(churn.retained).toBe(2);
    expect(churn.entered).toBe(1);
    expect(churn.exited).toBe(1);
    expect(churn.retentionPrev).toBeCloseTo(2 / 3, 10);
    expect(churn.retentionCurrent).toBeCloseTo(2 / 3, 10);
  });

  it('extracts generic ISI payload fields', () => {
    expect(extractAssetDefinitionIdFromIsiPayload({ object: SAMPLE_ASSET_ID })).toBe(SAMPLE_ASSET_DEFINITION_ID);
    expect(extractAssetDefinitionIdFromIsiPayload({ object: { definition_id: SAMPLE_ASSET_ALIAS } })).toBe(
      SAMPLE_ASSET_ALIAS
    );
    expect(extractAmountFromIsiPayload({ value: '10' })?.toString()).toBe('10');
    expect(extractAmountFromIsiPayload({ quantity: '7' })?.toString()).toBe('7');
    expect(extractAmountFromIsiPayload({ value: { value: '3' } })?.toString()).toBe('3');
  });
});
