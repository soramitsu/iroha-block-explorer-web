# Legacy Blockly Studio

`ContractStudioBuilder.vue` and `blockly.ts` are retained for Studio v1 import/reference coverage only.

The primary `/studio` creation path is graph-first:

- `KotodamaStudioGraphDocumentV2` is the source of truth.
- Vue Flow graph nodes generate Kotodama source.
- Compiler diagnostics map back to graph nodes.
- Blockly workspace state may be preserved in `document.legacy`, but it must not drive compile/deploy.

Do not reintroduce Blockly into the main `/studio` surface without adding a new roadmap item that explains why the graph document is no longer sufficient.
