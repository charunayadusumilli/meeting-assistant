/**
 * Test Server Wrapper
 *
 * Provides a controlled server environment for integration and E2E tests.
 * Manages server lifecycle (start/stop) with random ports to avoid conflicts.
 */

const { Server } = require('socket.io');
const http = require('http');

class TestServer {
  constructor(app) {
    this.app = app;
    this.httpServer = http.createServer(app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    this.port = 0; // Will be assigned randomly
  }

  /**
   * Start the test server on a random available port
   * @returns {Promise<number>} The port number
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(0, (err) => {
        if (err) {
          reject(err);
        } else {
          this.port = this.httpServer.address().port;
          resolve(this.port);
        }
      });
    });
  }

  /**
   * Stop the test server
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise((resolve) => {
      // Close Socket.IO first
      this.io.close(() => {
        // Then close HTTP server
        this.httpServer.close(() => {
          resolve();
        });
      });
    });
  }

  /**
   * Get the base URL for the test server
   * @returns {string}
   */
  getUrl() {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get the Socket.IO instance for test setup
   * @returns {Server}
   */
  getIO() {
    return this.io;
  }

  /**
   * Get the HTTP server instance
   * @returns {http.Server}
   */
  getHttpServer() {
    return this.httpServer;
  }
}

module.exports = { TestServer };
