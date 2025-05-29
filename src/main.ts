import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { createServer } from './presentation/server';

async function main(): Promise<void> {
  try {
    const server = createServer()();
    const port = parseInt(process.env.PORT || '3000');

    console.log('🔧 Initializing Clean Architecture Application...');
    console.log('📦 Setting up Dependency Injection Container...');
    console.log('🗄️ Connecting to Database...');
    console.log('📧 Initializing Email Service...');
    console.log('📝 Setting up Logging...');

    const startResult = await server.start(port);

    pipe(
      startResult,
      E.fold(
        (error) => {
          console.error('❌ Failed to start server:', error);
          process.exit(1);
        },
        () => {
          console.log('✅ Application started successfully!');
          console.log('');
          console.log('🏗️ Clean Architecture Layers:');
          console.log('  📁 Domain Layer: Business entities and rules');
          console.log('  📁 Application Layer: Use cases and ports');
          console.log('  📁 Infrastructure Layer: Database, email, logging');
          console.log('  📁 Presentation Layer: REST API endpoints');
          console.log('');
          console.log('🔧 Dependency Injection Features:');
          console.log('  🔄 Request-scoped services with lifecycle management');
          console.log('  🏠 Singleton services for shared resources');
          console.log('  📊 Request-scoped logging with correlation IDs');
          console.log('  🗄️ Database connection pooling');
          console.log('');
          console.log('🌐 Available Endpoints:');
          console.log(`  GET  http://localhost:${port}/health - Health check`);
          console.log(`  GET  http://localhost:${port}/api - API documentation`);
          console.log(`  POST http://localhost:${port}/api/users - Create user`);
          console.log(`  GET  http://localhost:${port}/api/users/:id - Get user`);
          console.log('');
          console.log('📝 Example Usage:');
          console.log(`  curl -X POST http://localhost:${port}/api/users \\`);
          console.log('    -H "Content-Type: application/json" \\');
          console.log('    -d \'{"email":"test@example.com","name":"Test User","password":"password123"}\'');
        }
      )
    );

    // Graceful shutdown
    const setupGracefulShutdown = (): void => {
      const shutdown = async (): Promise<void> => {
        console.log('\n🛑 Shutting down gracefully...');
        const stopResult = await server.stop();
        pipe(
          stopResult,
          E.fold(
            (error) => {
              console.error('❌ Error during shutdown:', error);
              process.exit(1);
            },
            () => {
              console.log('✅ Server stopped successfully');
              process.exit(0);
            }
          )
        );
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    };

    setupGracefulShutdown();

  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main();
