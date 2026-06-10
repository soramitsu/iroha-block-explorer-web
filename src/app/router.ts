import { createRouter, createWebHistory } from 'vue-router';

export const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
  },
  {
    path: '/blocks',
    name: 'blocks-list',
    component: () => import('@/pages/BlocksList.vue'),
  },
  {
    path: '/blocks/:heightOrHash',
    name: 'blocks-details',
    component: () => import('@/pages/BlockDetails.vue'),
  },
  {
    path: '/assets',
    name: 'assets',
    component: () => import('@/pages/AssetsList.vue'),
  },
  {
    path: '/assets/:id',
    name: 'asset-details',
    component: () => import('@/pages/AssetDetails.vue'),
  },
  {
    path: '/econometrics',
    name: 'econometrics',
    component: () => import('@/pages/Econometrics.vue'),
  },
  {
    path: '/dataspaces',
    name: 'dataspaces',
    component: () => import('@/pages/Dataspaces.vue'),
  },
  {
    path: '/dataspaces/:laneId/:dataspaceId',
    name: 'dataspaces-details',
    component: () => import('@/pages/DataspaceDetails.vue'),
  },
  {
    path: '/nfts',
    name: 'nfts',
    component: () => import('@/pages/AssetsList.vue'),
  },
  {
    path: '/nfts/:id',
    name: 'nft-details',
    component: () => import('@/pages/NFTDetails.vue'),
  },
  {
    path: '/rwas',
    name: 'rwas',
    component: () => import('@/pages/AssetsList.vue'),
  },
  {
    path: '/rwas/:id',
    name: 'rwa-details',
    component: () => import('@/pages/RWADetails.vue'),
  },
  {
    path: '/accounts',
    name: 'accounts-list',
    component: () => import('@/pages/AccountsList.vue'),
  },
  {
    path: '/accounts/:id',
    name: 'account-details',
    component: () => import('@/pages/AccountDetails.vue'),
  },
  {
    path: '/domains',
    name: 'domains-list',
    component: () => import('@/pages/DomainsList.vue'),
  },
  {
    path: '/domains/:id',
    name: 'domain-details',
    component: () => import('@/pages/DomainDetails.vue'),
  },
  {
    path: '/transactions',
    name: 'transactions-list',
    component: () => import('@/pages/TransactionsList.vue'),
  },
  {
    path: '/transactions/:hash',
    name: 'transaction-details',
    component: () => import('@/pages/TransactionDetails.vue'),
  },
  {
    path: '/tracing',
    name: 'tracing-workspace',
    component: () => import('@/pages/TracingWorkspace.vue'),
  },
  {
    path: '/studio',
    name: 'kotodama-studio',
    component: () => import('@/pages/KotodamaStudio.vue'),
  },
  {
    path: '/soracloud',
    name: 'soracloud',
    component: () => import('@/pages/SoracloudPage.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/pages/NotFound.vue'),
  },
  {
    path: '/telemetry',
    name: 'telemetry',
    component: () => import('@/pages/NodesTelemetry.vue'),
  },
  {
    path: '/kaigi/relays',
    name: 'kaigi-relays',
    component: () => import('@/pages/KaigiRelays.vue'),
  },
  {
    path: '/governance',
    name: 'governance-dashboard',
    component: () => import('@/pages/GovernanceDashboard.vue'),
  },
  {
    path: '/contracts',
    name: 'smart-contracts',
    component: () => import('@/pages/SmartContractsPage.vue'),
  },
  {
    path: '/sorafs/registry',
    name: 'sorafs-registry',
    component: () => import('@/pages/SorafsRegistry.vue'),
  },
  {
    path: '/zk/telemetry',
    name: 'zk-telemetry',
    component: () => import('@/pages/ZkTelemetry.vue'),
  },
  {
    path: '/vpn',
    name: 'vpn-stats',
    component: () => import('@/pages/VpnStats.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
