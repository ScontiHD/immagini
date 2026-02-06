/**
 * PluginBridge provides a lightweight message bus to connect a host app with plugins.
 * It supports registration, middleware, and async message handling.
 */
class PluginBridge {
  constructor({ logger } = {}) {
    this.logger = logger || console;
    this.plugins = new Map();
    this.middlewares = [];
    this.listeners = new Map();
  }

  /**
   * Register a plugin handler.
   * @param {string} name
   * @param {(message: object, context: object) => Promise<object>|object} handler
   */
  registerPlugin(name, handler) {
    if (!name || typeof name !== "string") {
      throw new Error("Plugin name must be a non-empty string.");
    }
    if (typeof handler !== "function") {
      throw new Error("Plugin handler must be a function.");
    }
    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already registered.`);
    }
    this.plugins.set(name, handler);
    this.emit("plugin:registered", { name });
  }

  /**
   * Unregister a plugin.
   * @param {string} name
   */
  unregisterPlugin(name) {
    if (this.plugins.delete(name)) {
      this.emit("plugin:unregistered", { name });
    }
  }

  /**
   * Add middleware to intercept messages.
   * @param {(message: object, context: object, next: Function) => Promise<object>|object} middleware
   */
  use(middleware) {
    if (typeof middleware !== "function") {
      throw new Error("Middleware must be a function.");
    }
    this.middlewares.push(middleware);
  }

  /**
   * Send a message to a plugin.
   * @param {string} name
   * @param {object} message
   * @param {object} [context]
   * @returns {Promise<object>}
   */
  async send(name, message, context = {}) {
    if (!this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is not registered.`);
    }
    const handler = this.plugins.get(name);
    const pipeline = this.middlewares.reduceRight(
      (next, middleware) => async () => middleware(message, context, next),
      async () => handler(message, context)
    );

    const response = await pipeline();
    this.emit("plugin:message", { name, message, response });
    return response;
  }

  /**
   * Broadcast a message to all plugins.
   * @param {object} message
   * @param {object} [context]
   * @returns {Promise<object[]>}
   */
  async broadcast(message, context = {}) {
    const tasks = Array.from(this.plugins.keys()).map((name) =>
      this.send(name, message, context).catch((error) => {
        this.logger.error(`Broadcast error for plugin "${name}":`, error);
        return { error: error.message };
      })
    );
    return Promise.all(tasks);
  }

  /**
   * Subscribe to bridge events.
   * @param {string} event
   * @param {(payload: object) => void} callback
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Unsubscribe from bridge events.
   * @param {string} event
   * @param {(payload: object) => void} callback
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, payload) {
    if (!this.listeners.has(event)) {
      return;
    }
    for (const callback of this.listeners.get(event)) {
      try {
        callback(payload);
      } catch (error) {
        this.logger.error(`Listener error for event "${event}":`, error);
      }
    }
  }
}

module.exports = { PluginBridge };
