/**
 * Handlebars helpers customizados para Lumenn Frame.
 * Registrados no init hook.
 */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("lumenn-eq", (a, b) => a === b);
  Handlebars.registerHelper("lumenn-not", (v) => !v);
  Handlebars.registerHelper("lumenn-and", (...args) => args.slice(0, -1).every(Boolean));
  Handlebars.registerHelper("lumenn-or", (...args) => args.slice(0, -1).some(Boolean));
}
