# Klear Karma Backend API

A comprehensive Cloudflare Workers-based backend API for the Klear Karma wellness platform, connecting users with spiritual and holistic healing practitioners.

## 🌟 Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **User Management**: Customer and practitioner profiles with preferences
- **Appointment Booking**: Full booking lifecycle with conflict detection
- **Messaging System**: Real-time communication between users and practitioners
- **Review System**: Rating and review system with practitioner responses
- **Service Management**: Comprehensive service catalog with categories
- **Analytics Dashboard**: Business intelligence and performance metrics
- **Rate Limiting**: Intelligent rate limiting with KV storage
- **Security**: Comprehensive security middleware and encryption

## 🏗️ Architecture

### Technology Stack
- **Runtime**: Cloudflare Workers
- **Framework**: Hono.js
- **Storage**: Cloudflare KV
- **Authentication**: JWT with Web Crypto API
- **Language**: TypeScript

### KV Namespaces
- `USERS_KV`: User profiles and authentication data
- `PRACTITIONERS_KV`: Practitioner profiles and availability
- `APPOINTMENTS_KV`: Booking and appointment data
- `MESSAGES_KV`: Messaging and conversation data
- `SERVICES_KV`: Service catalog and offerings
- `REVIEWS_KV`: Reviews and ratings data
- `ANALYTICS_KV`: Analytics events and metrics

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Cloudflare account
- Wrangler CLI

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd klear-karma-backend

# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Create KV namespaces
wrangler kv:namespace create "USERS_KV"
wrangler kv:namespace create "PRACTITIONERS_KV"
wrangler kv:namespace create "APPOINTMENTS_KV"
wrangler kv:namespace create "MESSAGES_KV"
wrangler kv:namespace create "SERVICES_KV"
wrangler kv:namespace create "REVIEWS_KV"
wrangler kv:namespace create "ANALYTICS_KV"

# Update wrangler.jsonc with your KV namespace IDs

# Set up secrets
wrangler secret put JWT_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put WEBHOOK_SECRET
```

### Development

```bash
# Start development server
npm run dev
# or
wrangler dev --local

# Populate mock data
curl -X POST http://localhost:8787/populate-mock-data

# Run tests
npm test
```

### Deployment

#### Domain Configuration

Before deploying, ensure you have configured the `klearkarma.life` domain in Cloudflare:

1. **Add Domain to Cloudflare**: Follow the guide in `cloudflare-dns-setup.md`
2. **Configure DNS Records**: Set up subdomains for API endpoints
3. **Update Nameservers**: Point your domain to Cloudflare nameservers

#### Deploy Commands

```bash
# Deploy to development environment
wrangler deploy --env development

# Deploy to staging environment
wrangler deploy --env staging

# Deploy to production environment
wrangler deploy --env production

# Deploy with custom domain (after DNS setup)
wrangler deploy --env production --route "api.klearkarma.life/*"
```

#### Environment-Specific Deployments

```bash
# Development (dev-api.klearkarma.life)
wrangler deploy --env development

# Staging (staging-api.klearkarma.life)
wrangler deploy --env staging

# Production (api.klearkarma.life)
wrangler deploy --env production
```

## 📚 API Documentation

### Base URLs

#### Production
- **API**: `https://api.klearkarma.life`
- **Health Check**: `https://api.klearkarma.life/health`
- **Admin Portal**: `https://api.klearkarma.life/admin`

#### Staging
- **API**: `https://staging-api.klearkarma.life`
- **Health Check**: `https://staging-api.klearkarma.life/health`

#### Development
- **API**: `https://dev-api.klearkarma.life`
- **Local**: `http://localhost:8787`
- **Health Check**: `http://localhost:8787/health`

### Authentication

All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### API Endpoints

#### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/auth/register` | User registration | No |
| POST | `/api/v1/auth/login` | User login | No |
| POST | `/api/v1/auth/refresh` | Refresh JWT token | No |
| POST | `/api/v1/auth/logout` | User logout | Yes |
| POST | `/api/v1/auth/forgot-password` | Request password reset | No |
| POST | `/api/v1/auth/reset-password` | Reset password | No |
| POST | `/api/v1/auth/verify-email` | Verify email address | No |
| GET | `/api/v1/auth/me` | Get current user | Yes |

#### Users

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/users/profile` | Get user profile | Yes |
| PUT | `/api/v1/users/profile` | Update user profile | Yes |
| POST | `/api/v1/users/change-password` | Change password | Yes |
| PUT | `/api/v1/users/preferences` | Update preferences | Yes |
| GET | `/api/v1/users/appointments` | Get user appointments | Yes |
| GET | `/api/v1/users/messages` | Get user messages | Yes |
| GET | `/api/v1/users/reviews` | Get user reviews | Yes |
| DELETE | `/api/v1/users/account` | Delete user account | Yes |

#### Practitioners

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/practitioners` | List practitioners | No |
| GET | `/api/v1/practitioners/:id` | Get practitioner details | No |
| GET | `/api/v1/practitioners/:id/availability` | Get availability | No |
| PUT | `/api/v1/practitioners/profile` | Update practitioner profile | Yes (Practitioner) |
| GET | `/api/v1/practitioners/appointments` | Get practitioner appointments | Yes (Practitioner) |
| PUT | `/api/v1/practitioners/availability` | Update availability | Yes (Practitioner) |

#### Services

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/services` | List services | No |
| GET | `/api/v1/services/:id` | Get service details | No |
| GET | `/api/v1/services/categories` | Get service categories | No |
| GET | `/api/v1/services/practitioner/:id` | Get practitioner services | No |
| POST | `/api/v1/services` | Create service | Yes (Practitioner) |
| PUT | `/api/v1/services/:id` | Update service | Yes (Practitioner) |
| DELETE | `/api/v1/services/:id` | Delete service | Yes (Practitioner) |

#### Appointments

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/appointments` | Book appointment | Yes |
| GET | `/api/v1/appointments/:id` | Get appointment details | Yes |
| PUT | `/api/v1/appointments/:id/status` | Update appointment status | Yes |
| PUT | `/api/v1/appointments/:id/reschedule` | Reschedule appointment | Yes |
| PUT | `/api/v1/appointments/:id/notes` | Add appointment notes | Yes |
| GET | `/api/v1/appointments` | List appointments (Admin) | Yes (Admin) |

#### Messages

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/messages` | Send message | Yes |
| GET | `/api/v1/messages/:id` | Get message details | Yes |
| GET | `/api/v1/messages/conversations` | Get user conversations | Yes |
| GET | `/api/v1/messages/conversation/:id` | Get conversation messages | Yes |
| PUT | `/api/v1/messages/conversation/:id/read` | Mark conversation as read | Yes |
| DELETE | `/api/v1/messages/:id` | Delete message | Yes |
| GET | `/api/v1/messages` | List all messages (Admin) | Yes (Admin) |

#### Reviews

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/reviews` | Create review | Yes |
| GET | `/api/v1/reviews/:id` | Get review details | No |
| PUT | `/api/v1/reviews/:id` | Update review | Yes |
| POST | `/api/v1/reviews/:id/response` | Add practitioner response | Yes (Practitioner) |
| POST | `/api/v1/reviews/:id/helpful` | Mark review as helpful | Yes |
| POST | `/api/v1/reviews/:id/report` | Report review | Yes |
| GET | `/api/v1/reviews` | List reviews | No |

#### Products

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/products` | List products with filters | No |
| GET | `/api/v1/products/:id` | Get product details | No |
| POST | `/api/v1/products` | Create new product | Yes (Practitioner/Admin) |
| PUT | `/api/v1/products/:id` | Update product | Yes (Practitioner/Admin) |
| DELETE | `/api/v1/products/:id` | Delete product | Yes (Practitioner/Admin) |
| POST | `/api/v1/products/:id/verify` | Verify product | Yes (Curator/Admin) |

##### List Products with Filters

```bash
# Get all products
curl "http://localhost:8787/api/v1/products"

# Search products by name or description
curl "http://localhost:8787/api/v1/products?search=meditation"

# Filter products by category
curl "http://localhost:8787/api/v1/products?category=books"

# Filter by price range
curl "http://localhost:8787/api/v1/products?minPrice=10&maxPrice=50"

# Filter by modality
curl "http://localhost:8787/api/v1/products?modality=digital"

# Sort products
curl "http://localhost:8787/api/v1/products?sort=price&order=asc"

# Pagination
curl "http://localhost:8787/api/v1/products?page=2&limit=10"

# Combined filters
curl "http://localhost:8787/api/v1/products?category=crystals&minPrice=20&sort=rating&order=desc&page=1&limit=20"
```

Response:

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "product-123",
        "name": "Meditation Crystal Set",
        "description": "A set of 5 crystals for meditation practice",
        "price": 29.99,
        "category": "crystals",
        "images": ["https://example.com/images/crystal-set.jpg"],
        "practitionerId": "practitioner-456",
        "practitionerName": "Jane Smith",
        "rating": 4.8,
        "reviewCount": 24,
        "modality": "physical",
        "inStock": true,
        "isVerified": true,
        "createdAt": "2024-07-01T12:00:00.000Z",
        "updatedAt": "2024-07-10T15:30:00.000Z"
      },
      // More products...
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "pages": 3
    }
  }
}
```

##### Get Product Details

```bash
curl "http://localhost:8787/api/v1/products/product-123"
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "product-123",
    "name": "Meditation Crystal Set",
    "description": "A set of 5 crystals for meditation practice, including amethyst, clear quartz, rose quartz, black tourmaline, and citrine. Each crystal is hand-selected for quality and energy.",
    "price": 29.99,
    "category": "crystals",
    "images": [
      "https://example.com/images/crystal-set-1.jpg",
      "https://example.com/images/crystal-set-2.jpg"
    ],
    "practitionerId": "practitioner-456",
    "practitionerName": "Jane Smith",
    "rating": 4.8,
    "reviewCount": 24,
    "modality": "physical",
    "inStock": true,
    "isVerified": true,
    "createdAt": "2024-07-01T12:00:00.000Z",
    "updatedAt": "2024-07-10T15:30:00.000Z",
    "details": {
      "weight": "250g",
      "dimensions": "10cm x 8cm x 5cm",
      "materials": ["Amethyst", "Clear Quartz", "Rose Quartz", "Black Tourmaline", "Citrine"],
      "origin": "Brazil",
      "instructions": "Cleanse crystals under moonlight once a month"
    }
  }
}
```

##### Create New Product

```bash
curl -X POST "http://localhost:8787/api/v1/products" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{
    "name": "Chakra Balancing eBook",
    "description": "A comprehensive guide to balancing your chakras",
    "price": 12.99,
    "category": "books",
    "images": ["https://example.com/images/chakra-ebook.jpg"],
    "modality": "digital",
    "inStock": true,
    "details": {
      "format": "PDF",
      "pages": 120,
      "language": "English"
    }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "product-789",
    "name": "Chakra Balancing eBook",
    "description": "A comprehensive guide to balancing your chakras",
    "price": 12.99,
    "category": "books",
    "images": ["https://example.com/images/chakra-ebook.jpg"],
    "practitionerId": "practitioner-456",
    "practitionerName": "Jane Smith",
    "rating": 0,
    "reviewCount": 0,
    "modality": "digital",
    "inStock": true,
    "isVerified": false,
    "createdAt": "2024-07-20T09:15:00.000Z",
    "updatedAt": "2024-07-20T09:15:00.000Z",
    "details": {
      "format": "PDF",
      "pages": 120,
      "language": "English"
    }
  },
  "message": "Product created successfully"
}
```

##### Update Product

```bash
curl -X PUT "http://localhost:8787/api/v1/products/product-789" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{
    "price": 9.99,
    "description": "A comprehensive guide to balancing your chakras with practical exercises",
    "details": {
      "format": "PDF and EPUB",
      "pages": 120,
      "language": "English"
    }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "product-789",
    "name": "Chakra Balancing eBook",
    "description": "A comprehensive guide to balancing your chakras with practical exercises",
    "price": 9.99,
    "category": "books",
    "images": ["https://example.com/images/chakra-ebook.jpg"],
    "practitionerId": "practitioner-456",
    "practitionerName": "Jane Smith",
    "rating": 0,
    "reviewCount": 0,
    "modality": "digital",
    "inStock": true,
    "isVerified": false,
    "createdAt": "2024-07-20T09:15:00.000Z",
    "updatedAt": "2024-07-20T10:30:00.000Z",
    "details": {
      "format": "PDF and EPUB",
      "pages": 120,
      "language": "English"
    }
  },
  "message": "Product updated successfully"
}
```

##### Verify Product

```bash
curl -X POST "http://localhost:8787/api/v1/products/product-789/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <curator_jwt_token>" \
  -d '{
    "verified": true,
    "notes": "Content reviewed and approved"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "product-789",
    "isVerified": true,
    "verifiedAt": "2024-07-20T14:45:00.000Z",
    "verifiedBy": "curator-123"
  },
  "message": "Product verified successfully"
}
```

##### Delete Product

```bash
curl -X DELETE "http://localhost:8787/api/v1/products/product-789" \
  -H "Authorization: Bearer <jwt_token>"
```

Response:

```json
{
  "success": true,
  "message": "Product deleted successfully"
}
```

#### Analytics

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/analytics/track` | Track event | Internal |
| GET | `/api/v1/analytics/dashboard` | Get dashboard overview | Yes (Admin) |
| GET | `/api/v1/analytics/users` | Get user analytics | Yes (Admin) |
| GET | `/api/v1/analytics/appointments` | Get appointment analytics | Yes (Admin) |
| GET | `/api/v1/analytics/revenue` | Get revenue analytics | Yes (Admin) |
| GET | `/api/v1/analytics/health` | Get system health | Yes (Admin) |
| GET | `/api/v1/analytics/practitioner/:id?` | Get practitioner analytics | Yes (Practitioner/Admin) |

### Request/Response Examples

#### User Registration

```bash
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "role": "user"
  }'
```

#### Book Appointment

```bash
curl -X POST http://localhost:8787/api/v1/appointments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{
    "practitionerId": "practitioner-id",
    "serviceId": "service-id",
    "date": "2024-12-25",
    "time": "14:00",
    "type": "virtual",
    "notes": "First time booking"
  }'
```

#### Search Practitioners

```bash
curl "http://localhost:8787/api/v1/practitioners?specialization=Reiki&city=New+York&available=true&limit=10"
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|----------|
| `ENVIRONMENT` | Deployment environment | `development` |
| `API_VERSION` | API version | `v1` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |

### Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `JWT_SECRET` | JWT signing secret | Yes |
| `ENCRYPTION_KEY` | Data encryption key | Yes |
| `WEBHOOK_SECRET` | Webhook verification secret | Yes |

## 🧪 Testing

### Mock Data

The project includes comprehensive mock data generation:

```bash
# Populate mock data via API
curl -X POST http://localhost:8787/populate-mock-data

# Or run the populate script directly
wrangler dev scripts/run-populate.ts --local
```

Mock data includes:
- 50 customer profiles
- 25 practitioner profiles
- 100+ services
- 200+ appointments
- 300+ reviews
- 500+ messages
- Analytics data

### API Testing

```bash
# Test health endpoint
curl http://localhost:8787/health

# Test authentication
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'

# Test protected endpoint
curl -H "Authorization: Bearer <token>" \
  http://localhost:8787/api/v1/users/profile
```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Intelligent rate limiting per endpoint
- **Input Validation**: Comprehensive input sanitization
- **CORS Protection**: Configurable CORS policies
- **Security Headers**: Standard security headers
- **Password Hashing**: PBKDF2-based password hashing
- **Data Encryption**: AES-GCM encryption for sensitive data
- **Role-Based Access**: Granular permission system

## 📊 Performance

- **Edge Computing**: Deployed on Cloudflare's global network
- **KV Storage**: Fast, globally distributed key-value storage
- **Caching**: Intelligent caching strategies
- **Rate Limiting**: Prevents abuse and ensures fair usage
- **Monitoring**: Built-in analytics and health monitoring

## 🚨 Error Handling

The API uses standardized error responses:

```json
{
  "error": "ValidationError",
  "message": "Invalid input data",
  "details": {
    "field": "email",
    "issue": "Invalid email format"
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "requestId": "req_123456789"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource conflict |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |

## 📈 Monitoring & Analytics

### Health Monitoring

```bash
# Check system health
curl http://localhost:8787/health

# Get detailed analytics (Admin only)
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:8787/api/v1/analytics/dashboard
```

### Metrics Tracked

- User registrations and logins
- Appointment bookings and completions
- Message volume
- Review submissions
- Revenue analytics
- System performance
- Error rates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API examples

---

**Built with ❤️ using Cloudflare Workers and Hono.js**