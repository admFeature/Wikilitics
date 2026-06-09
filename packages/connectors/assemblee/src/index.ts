/** @app/connectors-assemblee — open data « Scrutins » de l'Assemblée nationale. */
export {
  parseScrutin,
  scrutinSourceUrl,
  SCRUTINS_ZIP_URL,
  ASSEMBLEE_LICENCE,
  type ParsedScrutin,
  type ParsedVote,
} from "./an-scrutins.js";
export { AssembleeVotesIndex } from "./votes-index.js";
