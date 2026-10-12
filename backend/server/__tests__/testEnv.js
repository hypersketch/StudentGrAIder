// Runs before every test file. Gives the tests their own JWT secret so they
// don't depend on a local .env (dotenv won't override a value already set).
process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret'
