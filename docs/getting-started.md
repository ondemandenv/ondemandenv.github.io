# Getting Started with OnDemandEnv

## Prerequisites

- GitHub Account
- AWS Account
- Basic understanding of microservices architecture

## Step-by-Step Setup

### 1. Fork Contracts Library
- Navigate to [Contracts Lib Repository](https://github.com/ondemandenv/odmd-contracts-sandbox)
- Fork the repository to your GitHub account

### 2. Configure GitHub App
- Create a new GitHub App in your GitHub settings
- Generate and securely store the private key
- Note the Application ID and Installation ID

### 3. Define Service Contracts
- Edit the forked Contracts Library
- Create contract definitions using the provided abstract class
- Specify:
  - AWS Accounts
  - GitHub Repository Organization/Names
  - GitHub App Installation Details

### 4. Publish Contracts Library
- Generate a package token
- Publish the contracts library to your organization's package registry

### 5. Deploy Central Automation Stack
- Create an AWS account for central automation
- Set up required secrets and configurations
- Deploy the central-artifact stack
- Configure SQS queue for artifact management

### 6. Initialize Environments
- Wait for central automation to initialize
- Receive email notifications for deployment status
- Verify service environments are created successfully

## Configuration Tips
- Use strongly typed code for contract definitions
- Ensure least privilege access
- Follow domain-driven design principles

## Recommended Next Steps
- Explore sample projects
- Review visualization tools
- Join community discussions

## Troubleshooting
- Check GitHub App permissions
- Verify AWS account configurations
- Review contract library implementation

## Support
- Email support