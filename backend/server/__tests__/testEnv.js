// Runs before every test file. Gives the tests their own JWT secret so they
// don't depend on a local .env (dotenv won't override a value already set).
process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret'
// Never call the real (paid) Claude API from tests, even if .env has a key. The AI grading tests use a fake grader.
process.env.ANTHROPIC_API_KEY = ''
// Never send real email from tests either
process.env.SMTP_HOST = ''
process.env.GMAIL_USER = ''
process.env.GMAIL_APP_PASSWORD = ''
process.env.BREVO_API_KEY = ''
