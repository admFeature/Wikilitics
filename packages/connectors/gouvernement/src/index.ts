/** @app/connectors-gouvernement — composition du Gouvernement (open data DILA). */
export { GouvernementConnector, createGouvernementConnector } from "./connector.js";
export {
  parseGouvernement,
  splitName,
  slugify,
  type Ministre,
  type Gouvernement,
} from "./parse.js";
