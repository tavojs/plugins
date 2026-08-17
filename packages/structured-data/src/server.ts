import { definePluginPhase } from "@tavojs/core/plugin";
import { StructuredData } from "./index.js";
import type {
  StructuredDataDocument,
  StructuredDataScriptProps,
  StructuredDataUrlPolicy
} from "./types.js";

export function createStructuredDataServerPhase(
  data: StructuredDataDocument | undefined,
  script: StructuredDataScriptProps,
  setUrlPolicy?: (policy: StructuredDataUrlPolicy) => void
) {
  return definePluginPhase({
    ...(data === undefined
      ? {}
      : {
          head: {
            "structured-data": StructuredData({
              data,
              ...(script.id === undefined ? {} : { id: script.id }),
              ...(script.nonce === undefined ? {} : { nonce: script.nonce })
            })
          }
        }),
    setup(context) {
      const urlPolicy = (context as typeof context & {
        urlPolicy?: StructuredDataUrlPolicy;
      }).urlPolicy;
      if (urlPolicy) setUrlPolicy?.(urlPolicy);
    }
  });
}
