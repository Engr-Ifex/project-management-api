import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './src/config/database.js';
import registerGracefulShutdown from './src/utils/gracefulShutdown.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log('=====================================');
      console.log('🚀 Product Management API Started');
      console.log('=====================================');
      console.log(`🌍 Environment : ${process.env.NODE_ENV}`);
      console.log(`🚀 Server      : http://localhost:${PORT}`);
      console.log('=====================================');
    });

    // Register graceful shutdown handlers
    registerGracefulShutdown(server);
  } catch (error) {
    console.error('❌ Failed to start the server.');
    console.error(error.message);
    process.exit(1);
  }
};

startServer();



