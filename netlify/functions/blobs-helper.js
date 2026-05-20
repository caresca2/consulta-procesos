const { getStore } = require("@netlify/blobs");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableBlobError(error) {
  const msg = error?.message || "";
  return (
    error?.name === "BlobsInternalError" ||
    error?.status === 503 ||
    msg.includes("503") ||
    msg.includes("internal error")
  );
}

function getStoreProcesos() {
  const opts = { name: "procesos-historial" };

  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    opts.siteID = process.env.NETLIFY_SITE_ID;
    opts.token = process.env.NETLIFY_AUTH_TOKEN;
  }

  return getStore(opts);
}

async function withBlobRetry(fn, intentos = 5) {
  let lastError;

  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableBlobError(error) || i === intentos - 1) {
        throw error;
      }

      const delay = 1500 * (i + 1);
      console.warn(`Blobs 503/error, reintento ${i + 1}/${intentos - 1} en ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function blobGet(key, options) {
  const store = getStoreProcesos();
  return withBlobRetry(() => store.get(key, options));
}

async function blobSetJSON(key, data) {
  const store = getStoreProcesos();
  return withBlobRetry(() => store.setJSON(key, data));
}

module.exports = {
  getStoreProcesos,
  withBlobRetry,
  blobGet,
  blobSetJSON,
  isRetryableBlobError
};
