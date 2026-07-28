(function registerPopupState(globalObject) {
  function manualFieldCount(result) {
    return ["review_count", "error_count"].reduce(
      (total, key) => total + Number(result?.[key] || 0),
      0,
    );
  }

  const api = { manualFieldCount };
  globalObject.JobFlowPopupState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
