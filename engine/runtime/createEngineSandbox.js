function createEngineSandbox(options = {}) {
  const noop = () => {};
  const fetchImpl =
    options.fetchImpl ||
    (async () => {
      throw new Error("fetch should not be called during engine harness tests");
    });

  const elementStub = {
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: noop,
    setAttribute: noop,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: {},
    dataset: {},
    innerHTML: "",
    textContent: "",
    value: "",
    getContext: () => ({})
  };

  const documentStub = {
    body: { dataset: { appMode: options.appMode || "engine-demo" } },
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => elementStub,
    createElement: () => ({ ...elementStub })
  };

  const sandbox = {
    console: options.consoleImpl || console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Intl,
    Date,
    Math,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    JSON,
    fetch: fetchImpl,
    alert: noop,
    patients: options.patients || [],
    document: documentStub,
    window: {
      handoffAppApi: {},
      document: documentStub,
      addEventListener: noop,
      removeEventListener: noop
    },
    globalThis: null
  };

  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  return sandbox;
}

module.exports = {
  createEngineSandbox
};
