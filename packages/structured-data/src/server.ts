import { definePluginPhase } from "@tavojs/core/plugin";
import { StructuredData } from "./index.js";
import type {
  StructuredDataDocument,
  StructuredDataScriptProps
} from "./types.js";

export function createStructuredDataServerPhase(
  data: StructuredDataDocument,
  script: StructuredDataScriptProps
) {
  return definePluginPhase({
    head: {
      "structured-data": StructuredData({
        data,
        ...(script.id === undefined ? {} : { id: script.id }),
        ...(script.nonce === undefined ? {} : { nonce: script.nonce })
      })
    }
  });
}
