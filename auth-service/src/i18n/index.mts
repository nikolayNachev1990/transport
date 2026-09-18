import i18n from "i18n";
import localeConfig from "../config/locale.mjs";

i18n.configure({
  locales: localeConfig.langs,
  directory: localeConfig.directory,
  defaultLocale: localeConfig.defaultLocale,
  header: localeConfig.header,
  queryParameter: localeConfig.queryParameter,
});

export default i18n;
