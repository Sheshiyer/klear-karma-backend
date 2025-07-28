// Quick debug script to test environment variables
const response = await fetch('http://localhost:8788/api/v1/admin/analytics/dashboard', {
  method: 'GET',
  headers: {
    'X-Admin-Key': 'admin-api-key-for-development-only-change-in-production',
    'Content-Type': 'application/json'
  }
});

console.log('Status:', response.status);
console.log('Response:', await response.text());