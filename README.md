# AWS VPC Module for CDKTF (Typescript)

## Overview

This CDKTF module creates a fully featured AWS VPC with customizable subnet configurations. It supports both IPv4 and IPv6 addressing and can create public, private, and database subnets across multiple availability zones.

## Features

- Creates VPC with IPv4 and IPv6 CIDR blocks
- Automatically spans across the all availability zones
- Supports multiple subnet types:
  - Public subnets (default)
  - Private subnets (optional)
  - Database subnets (optional)
- Automatic CIDR block calculation and distribution
- Internet Gateway for public subnets
- Optional NAT Gateway for private subnets (IPv4)
- Optional Egress-Only Internet Gateway for private subnets (IPv6)
- Automatic route table creation and association
- Resource tagging with customizable tags

## Installation

```bash
npm install @scalereal/terraform-aws-vpc
# or
yarn add @scalereal/terraform-aws-vpc
# or
pnpm add @scalereal/terraform-aws-vpc
```

## Usage

```typescript
import { VpcModule } from '@scalereal/cdktf-aws-vpc';

// In your CDKTF stack
const vpc = new VpcModule(this, 'vpc', {
  cidr: '10.0.0.0/16',
  service_name: 'myapp',
  env: 'dev',
  enable_private_subnets: true, // optional
  enable_database_subnets: true, // optional
  enable_ip4_nat: true, // optional
  enable_ip6_egw: true, // optional
  tags: {
    Project: 'MyProject', // optional
    Owner: 'DevOps' // optional
  }
});
```

## Configuration Options

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `cidr` | string | Yes | - | IPv4 CIDR block for the VPC |
| `service_name` | string | Yes | - | Name of the service/application |
| `env` | string | Yes | - | Environment name (e.g., dev, prod) |
| `enable_private_subnets` | boolean | No | false | Enable private subnet creation |
| `enable_database_subnets` | boolean | No | false | Enable database subnet creation |
| `enable_ip4_nat` | boolean | No | false | Enable NAT Gateway for private subnets |
| `enable_ip6_egw` | boolean | No | false | Enable Egress-Only Gateway for IPv6 |
| `tags` | object | No | {} | Additional tags to apply to resources |

## Outputs

| Name | Type | Description |
|------|------|-------------|
| `vpc_id` | string | ID of the created VPC |
| `vpc_cidr` | string | IPv4 CIDR block of the VPC |
| `vpc_ipv6_cidr` | string | IPv6 CIDR block of the VPC |
| `public_subnet_ids` | string[] | List of public subnet IDs |
| `private_subnet_ids` | string[] | List of private subnet IDs (if enabled) |
| `database_subnet_ids` | string[] | List of database subnet IDs (if enabled) |

## Architecture

The module creates the following architecture:

1. VPC with IPv4 and IPv6 CIDR blocks
2. Public subnets in all available AZs with:
   - Internet Gateway
   - Route table with routes to IGW
3. Optional private subnets with:
   - NAT Gateway (if enabled)
   - Egress-Only Internet Gateway (if enabled)
   - Route table with appropriate routes
4. Optional database subnets with:
   - Isolated route table

## Requirements

- CDKTF >= 0.20.0
- Node.js >= 20.x
- AWS Provider

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

BSD 3-Clause License - See [LICENSE](LICENSE) for details.

## About Us

This module is maintained by the DevOps team at ScaleReal Technologies. We're a remote first company with a cohesive team, working asynchronously to help people across the globe to build and scale their dream projects.

For more information about ScaleReal and our work:
- Website: [https://scalereal.com/](https://scalereal.com/)
- GitHub: [https://github.com/scalereal](https://github.com/scalereal)
