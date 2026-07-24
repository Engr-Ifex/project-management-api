import mongoose from 'mongoose';

/**
 * Registers graceful shutdown handlers for the application.
 *
 * @param {import('http').Server} server - HTTP server instance returned by app.listen()
 */
const registerGracefulShutdown = (server) => {
  const shutdown = async (signal) => {
  console.log(`\n📴 ${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    console.log('🛑 HTTP server closed.');

    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed.');

    console.log('👋 Application stopped successfully.');
    process.exit(0);
  });
};

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

export default registerGracefulShutdown;