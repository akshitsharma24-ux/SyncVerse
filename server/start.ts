// Set production mode before loading dotenv, route modules, and the HTTP server.
process.env.NODE_ENV = 'production';
void import('./index');
