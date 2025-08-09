# PrintFlow - Print Shop Management SaaS

A modern, multi-tenant SaaS application for print shop management. Built with TypeScript, React, Node.js, and PostgreSQL.

## 🚀 Features

- **Multi-tenant Architecture**: Secure data isolation for multiple print shops
- **Quote Management**: Create, track, and manage customer quotes with real-time pricing
- **Advanced Pricing Engine**: Flexible pricing calculations with material costs, labor, and markup
- **Customer Management**: Comprehensive CRM features for print shop clients
- **Work Order Tracking**: Convert accepted quotes to trackable work orders
- **Role-Based Access Control**: Admin, Sales, and Production roles with specific permissions
- **Real-time Updates**: WebSocket support for live status updates
- **PDF Generation**: Professional quote PDFs with customizable templates
- **Email Integration**: Automated quote delivery and follow-ups

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## 🏗️ Architecture Overview

```
PrintFlow/
├── backend/                 # Node.js/Express API
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Utility functions
│   │   └── validators/     # Request validation
│   ├── prisma/             # Database schema
│   └── tests/              # Test files
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks
│   │   ├── api/            # API client
│   │   └── store/          # State management
└── docs/                   # Documentation
```

### Tech Stack

**Backend:**
- Node.js 20+ with TypeScript
- Express.js for REST API
- Prisma ORM with PostgreSQL
- JWT authentication with httpOnly cookies
- Zod for validation
- Jest for testing

**Frontend:**
- React 18+ with TypeScript
- Vite for build tooling
- React Query for data fetching
- React Hook Form for forms
- Tailwind CSS for styling

**Infrastructure:**
- Docker & Docker Compose
- PostgreSQL 15+
- Redis for caching/rate limiting
- S3-compatible storage for files
- SendGrid/AWS SES for emails

## 📦 Prerequisites

- Node.js 20+ and npm 9+
- Docker and Docker Compose
- Git

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/printflow.git
   cd printflow
   ```

2. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Run database migrations**
   ```bash
   docker-compose exec backend npm run db:migrate
   ```

4. **Seed initial data (optional)**
   ```bash
   docker-compose exec backend npm run db:seed
   ```

5. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - API Health: http://localhost:3000/api/health

## 💻 Development Setup

### Backend Development

1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

### Frontend Development

1. **Install dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```

### Database Management

```bash
# Generate Prisma client
npm run db:generate

# Create new migration
npm run db:migrate

# Open Prisma Studio
npm run db:studio

# Reset database (WARNING: deletes all data)
npm run db:reset
```

## 📚 API Documentation

### Authentication Endpoints

```
POST   /api/auth/login      # User login
POST   /api/auth/register   # User registration
POST   /api/auth/logout     # User logout
GET    /api/auth/verify     # Verify authentication
POST   /api/auth/refresh    # Refresh JWT token
```

### Customer Management

```
GET    /api/customers       # List customers (paginated)
POST   /api/customers       # Create customer
GET    /api/customers/:id   # Get customer details
PUT    /api/customers/:id   # Update customer
DELETE /api/customers/:id   # Delete customer
GET    /api/customers/:id/stats  # Customer statistics
```

### Quote Management

```
GET    /api/quotes          # List quotes (paginated)
POST   /api/quotes          # Create quote
GET    /api/quotes/:id      # Get quote details
PUT    /api/quotes/:id      # Update quote
POST   /api/quotes/:id/send # Send quote via email
POST   /api/quotes/:id/accept   # Accept quote
POST   /api/quotes/:id/reject   # Reject quote
```

### Example API Request

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# Create customer (authenticated)
curl -X POST http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<jwt-token>" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

## 🧪 Testing

### Backend Testing

```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- pricing-engine.test.ts
```

### Frontend Testing

```bash
cd frontend

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### E2E Testing

```bash
# Run E2E tests with Cypress/Playwright
npm run test:e2e
```

## 🚀 Deployment

### Production Build

```bash
# Build backend
cd backend
npm run build

# Build frontend
cd frontend
npm run build
```

### Docker Production

```bash
# Build production images
docker build -t printflow-backend:latest ./backend
docker build -t printflow-frontend:latest ./frontend

# Run with production compose
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables

Create a `.env.production` file with:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/printflow

# Authentication
JWT_SECRET=<secure-random-string-min-32-chars>

# Email Service
SENDGRID_API_KEY=<your-sendgrid-key>

# File Storage
S3_BUCKET=<your-s3-bucket>
AWS_ACCESS_KEY_ID=<your-aws-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret>

# Application
NODE_ENV=production
BASE_URL=https://app.printflow.com
```

## 🤝 Contributing

### Development Workflow

1. Create feature branch: `git checkout -b feature/PF-123-description`
2. Make changes following coding standards
3. Write/update tests
4. Update documentation
5. Submit PR with completed checklist

### Coding Standards

- **TypeScript**: Strict mode enabled, explicit return types
- **Formatting**: Prettier with 120 char width, single quotes
- **Linting**: ESLint with security plugins
- **Commits**: Conventional commits (feat:, fix:, docs:, etc.)
- **Testing**: Minimum 90% coverage for critical paths

### Commit Message Format

```
feat(quotes): add real-time pricing calculation
fix(auth): resolve token expiration issue
docs(api): update endpoint documentation
test(pricing): add edge case coverage
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- Documentation: [docs/](./docs)
- Issues: [GitHub Issues](https://github.com/your-org/printflow/issues)
- Email: support@printflow.com

## 🔒 Security

- Multi-tenant data isolation with shop_id filtering
- JWT authentication with httpOnly cookies
- Input validation with Zod schemas
- SQL injection prevention via Prisma ORM
- Rate limiting on all endpoints
- CORS and security headers

For security issues, please email security@printflow.com

---

Built with ❤️ by the PrintFlow Team