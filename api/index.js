const url = require("url");
const path = require("path");
const fs = require("fs");

const SERVER_API_DIR = path.join(__dirname, "..", "server_api");

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getRoute(req) {
  const parsed = url.parse(req.url || "", true);

  let route = "";

  if (req.query && req.query.route) {
    route = req.query.route;
  } else if (parsed.query && parsed.query.route) {
    route = parsed.query.route;
  } else if (req.query && req.query.path) {
    route = req.query.path;
  } else if (parsed.query && parsed.query.path) {
    route = parsed.query.path;
  }

  if (Array.isArray(route)) {
    route = route.join("/");
  }

  route = String(route || "");

  if (!route) {
    route = String(parsed.pathname || "")
      .replace(/^\/api\/?/, "")
      .replace(/^index(?:\.js)?\/?/, "");
  }

  route = route.replace(/^\/+/, "").replace(/\/+$/, "");
  route = route.split("/")[0];

  return route;
}

module.exports = async function router(req, res) {
  try {
    const route = getRoute(req);

    if (!route) {
      return sendJson(res, 404, {
        error: "Route API manquante",
        message: "Exemple attendu : /api/login, /api/loans, /api/clients"
      });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(route) || route.startsWith("_")) {
      return sendJson(res, 404, { error: "Route API invalide" });
    }

    const file = path.join(SERVER_API_DIR, route + ".js");

    if (!file.startsWith(SERVER_API_DIR) || !fs.existsSync(file)) {
      return sendJson(res, 404, {
        error: "Route API introuvable",
        route
      });
    }

    if (req.query) {
      delete req.query.route;
      delete req.query.path;
    }

    const loaded = require(file);
    const handler = loaded && loaded.default ? loaded.default : loaded;

    if (typeof handler !== "function") {
      return sendJson(res, 500, {
        error: "Handler API invalide",
        route
      });
    }

    return await handler(req, res);
  } catch (error) {
    console.error("Erreur routeur API:", error);
    return sendJson(res, 500, {
      error: "Erreur serveur API",
      message: error && error.message ? error.message : String(error)
    });
  }
};
