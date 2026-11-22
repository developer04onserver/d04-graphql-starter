import { buildSchema, graphql, validateSchema } from "graphql";
export function createGraphQLService({ typeDefs, resolvers = {}, context = () => ({}) }) {
  const schema = buildSchema(typeDefs);
  const errors = validateSchema(schema);
  if (errors.length) throw new Error(errors.map(e => e.message).join("\n"));
  const rootValue = new Proxy({}, { get: (_, field) => (...args) => {
    const resolver = resolvers[field];
    if (typeof resolver !== "function") throw new Error("No resolver registered for " + String(field));
    const [input = {}, ctx = {}] = args;
    return resolver(input, ctx);
  }});
  return {
    schema,
    execute: (source, variables = {}, requestContext = {}) => graphql({ schema, source, rootValue, variableValues: variables, contextValue: context(requestContext) })
  };
}
export function createGraphQLHttpHandler(service) {
  return async (req, res) => {
    if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }); return res.end(); }
    let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) { res.writeHead(413); return res.end(); } }
    try {
      const body = JSON.parse(raw);
      const result = await service.execute(body.query, body.variables ?? {}, req);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ errors: [{ message: error.message }] }));
    }
  };
}