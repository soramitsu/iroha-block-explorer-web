# Taira Explorer Deployment

The Taira nginx vhost serves `taira-explorer.sora.org` from:

```text
/Users/administrator/dev/iroha2-block-explorer-web/dist
```

Build and sync the current checkout into that served root:

```bash
ops/taira/deploy-explorer.sh
```

Set `TAIRA_EXPLORER_PULL=1` to fast-forward the current branch before building.
Override `TAIRA_EXPLORER_SERVED_DIST` if nginx is moved to a different root.
