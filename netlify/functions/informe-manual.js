const agente = require("./agente-step");

exports.handler = async (event) => {
  return agente.handler(event);
};