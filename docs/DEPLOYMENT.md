# 🚀 Deployment Guide

This guide covers deploying the Drone Head application to various environments.

## Table of Contents

- [Production Checklist](#production-checklist)
- [Environment Variables](#environment-variables)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Security Considerations](#security-considerations)
- [Monitoring & Logging](#monitoring--logging)
- [Backup & Recovery](#backup--recovery)

---

## Production Checklist

Before deploying to production, ensure:

- [ ] `DEVELOPMENT_MODE` is NOT set to `true` or `develop`
- [ ] `JWT_SECRET` is a strong, unique secret
- [ ] Database directory has proper permissions
- [ ] HTTPS is configured (via reverse proxy)
- [ ] CORS is properly configured for your domain
- [ ] Rate limiting is implemented
- [ ] Error logging is configured
- [ ] Database backups are scheduled
- [ ] Monitoring is set up

---

## Environment Variables

### Required Variables

| Variable | Production Value | Description |
|----------|------------------|-------------|
| `JWT_SECRET` | Strong random string | JWT signing secret (min 32 chars) |
| `NODE_ENV` | `production` | Environment mode |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `backend/data` | Database directory |
| `DB_PATH` | `backend/data/data.db` | Database file path |
| `DEVELOPMENT_MODE` | `false` | Skip authentication |

### Generating JWT Secret

```bash
# Generate secure random string
openssl rand -base64 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### .env File Example

```bash
# backend/.env
PORT=3000
NODE_ENV=production
JWT_SECRET=your-secure-random-string-here-min-32-chars
DATA_DIR=backend/data
DB_PATH=backend/data/data.db
DEVELOPMENT_MODE=false
```

---

## Docker Deployment

### Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  drone-head:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - DATA_DIR=/app/data
    volumes:
      - drone-data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/auth/me"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  drone-data:
```

### Build and Deploy

```bash
# Build image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Docker Compose with Reverse Proxy

```yaml
version: '3.8'

services:
  drone-head:
    build: ./backend
    internal: true  # No direct external access
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - drone-head

volumes:
  drone-data:
```

### Nginx Configuration

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream drone-head {
        server drone-head:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;
        
        # Redirect to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        location / {
            proxy_pass http://drone-head;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # SSE support
            proxy_read_timeout 86400;
        }

        # Static files
        location /frontend {
            alias /app/frontend;
            try_files $uri $uri/ =404;
        }
    }
}
```

---

## Cloud Deployment

### AWS EC2

1. **Launch Instance**
   - AMI: Amazon Linux 2 or Ubuntu
   - Instance Type: t2.micro (minimum)
   - Security Groups: Allow port 22 (SSH), 80 (HTTP), 443 (HTTPS)

2. **Install Docker**
   ```bash
   # Amazon Linux 2
   sudo yum update -y
   sudo yum install docker -y
   sudo service docker start
   sudo usermod -a -G docker ec2-user
   
   # Ubuntu
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

3. **Deploy Application**
   ```bash
   git clone https://github.com/mhmdalkhyyt/drone-head.git
   cd drone-head
   echo "JWT_SECRET=$(openssl rand -base64 32)" > .env
   docker-compose up -d
   ```

### DigitalOcean Droplet

1. **Create Droplet**
   - Image: Docker 20.10 on Ubuntu 20.04
   - Size: Basic, $5/month (minimum)
   - Region: Closest to users

2. **Deploy via Cloud Initiative**
   ```bash
   # SSH into droplet
   ssh root@your-droplet-ip
   
   # Clone and deploy
   git clone https://github.com/mhmdalkhyyt/drone-head.git
   cd drone-head
   docker-compose up -d
   ```

### Heroku

1. **Prepare Application**
   ```bash
   # Add Heroku-specific files if needed
   # Create Procfile
   echo "web: cd backend && npm start" > Procfile
   ```

2. **Deploy**
   ```bash
   heroku login
   heroku create your-app-name
   heroku git:remote -a your-app-name
   
   # Set environment variables
   heroku config:set JWT_SECRET=$(openssl rand -base64 32)
   heroku config:set NODE_ENV=production
   
   # Deploy
   git push heroku main
   ```

### Railway

1. **Connect Repository**
   - Link GitHub repository
   - Railway auto-detects Node.js

2. **Configure**
   ```
   Variables:
   - JWT_SECRET: <generate>
   - NODE_ENV: production
   ```

3. **Deploy**
   - Railway auto-deploys on push

---

## Security Considerations

### Authentication Security

1. **JWT Configuration**
   ```javascript
   // Use short expiration
   const JWT_EXPIRES_IN = '24h';
   
   // Use strong algorithm
   const token = jwt.sign(payload, JWT_SECRET, {
     algorithm: 'HS256',
     expiresIn: JWT_EXPIRES_IN
   });
   ```

2. **Password Requirements**
   ```javascript
   // Minimum 6 characters
   if (password.length < 6) {
     return res.status(400).json({ error: 'Password must be at least 6 characters' });
   }
   ```

### HTTPS Configuration

**Never expose the application without HTTPS in production.**

Using Let's Encrypt:
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com
```

### CORS Configuration

```javascript
// In production, specify allowed origins
const corsOptions = {
  origin: ['https://your-domain.com'],
  credentials: true
};
app.use(cors(corsOptions));
```

### Rate Limiting

```bash
# Install
npm install express-rate-limit

# In server.js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### Input Validation

Always validate input before processing:
```javascript
// Validate coordinates
if (typeof lat !== 'number' || lat < -90 || lat > 90) {
  return res.status(400).json({ error: 'Invalid latitude' });
}
```

---

## Monitoring & Logging

### Application Logging

```javascript
// Structured logging
const logger = {
  info: (msg, data) => console.log(JSON.stringify({ level: 'info', msg, data, timestamp: new Date().toISOString() })),
  error: (msg, data) => console.error(JSON.stringify({ level: 'error', msg, data, timestamp: new Date().toISOString() })),
  warn: (msg, data) => console.warn(JSON.stringify({ level: 'warn', msg, data, timestamp: new Date().toISOString() }))
};

// Usage
logger.info('Drone created', { droneId: id });
logger.error('Database error', { error: error.message });
```

### Health Check Endpoint

```javascript
// Add health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### Monitoring Tools

| Tool | Purpose | Setup |
|------|---------|-------|
| PM2 | Process manager | `npm install -g pm2` |
| New Relic | APM | Add New Relic agent |
| Datadog | Monitoring | Add Datadog agent |
| Prometheus | Metrics | Add prometheus-client |

### PM2 Setup

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start backend/server.js --name drone-head

# Monitor
pm2 monit

# Logs
pm2 logs drone-head

# Auto-start on boot
pm2 startup
pm2 save
```

---

## Backup & Recovery

### Database Backup

```bash
# Manual backup
cp backend/data/data.db backend/data/data.db.backup.$(date +%Y%m%d)

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
cp backend/data/data.db $BACKUP_DIR/data_$DATE.db
find $BACKUP_DIR -name "data_*.db" -mtime +7 -delete  # Keep 7 days
```

### Docker Volume Backup

```bash
# Backup volume
docker run --rm -v drone-head_drone-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/backup.tar.gz -C /data .

# Restore volume
docker run --rm -v drone-head_drone-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/backup.tar.gz -C /data
```

### State Export/Import

```javascript
// Export current state
async function exportState() {
  return {
    drones: [...drones.values()],
    hubs: [...hubs.values()],
    fleets: [...fleets.values()],
    missions: [...missions.values()],
    // ... all entities
    timestamp: new Date().toISOString()
  };
}

// Import state (use with caution)
async function importState(state) {
  // Clear existing data
  drones.clear();
  hubs.clear();
  // ... clear all
  
  // Restore from state
  state.drones.forEach(d => drones.set(d.id, d));
  // ... restore all
}
```

### Disaster Recovery Plan

1. **Regular Backups**
   - Daily automated database backups
   - Weekly full state exports
   - Store backups off-site

2. **Recovery Steps**
   ```bash
   # 1. Stop services
   docker-compose down
   
   # 2. Restore database
   docker run --rm -v drone-head_drone-data:/data -v $(pwd):/backup alpine \
     tar xzf /backup/latest.tar.gz -C /data
   
   # 3. Start services
   docker-compose up -d
   
   # 4. Verify health
   curl https://your-domain.com/health
   ```

3. **Testing**
   - Test recovery monthly
   - Document recovery procedures
   - Train team on recovery process

---

## Performance Optimization

### Node.js Production Settings

```bash
# Set production flags
NODE_ENV=production node --max-old-space-size=512 server.js
```

### Connection Pooling

For SQLite, connection pooling isn't needed (single connection). For PostgreSQL migration:

```javascript
const { Pool } = require('pg');
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Caching

```javascript
// Simple in-memory cache
const cache = new Map();

function getCached(key, fn, ttl = 60000) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  const data = fn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}
```

---

## Troubleshooting

### Common Issues

**Issue: Port already in use**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

**Issue: Database locked**
```bash
# Check for active connections
# Ensure no multiple processes accessing database
# Consider using WAL mode
PRAGMA journal_mode=WAL;
```

**Issue: High memory usage**
```bash
# Monitor memory
pm2 monit

# Set memory limit
pm2 restart drone-head --max-memory-restart 400M
```

### Logs Location

| Environment | Log Location |
|-------------|--------------|
| Docker | `docker-compose logs` |
| PM2 | `~/.pm2/logs/` |
| Systemd | `/var/log/syslog` or `journalctl -u drone-head` |

---

*Last updated: 2024*