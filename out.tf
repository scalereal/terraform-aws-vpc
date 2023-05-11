output "id" {
  value       = aws_vpc.vpc.id
  description = "VPC ID"
}

output "cidr_block" {
  value       = aws_vpc.vpc.cidr_block
  description = "VPC CIDR block"
}

output "ipv6_cidr_block" {
  value       = var.enable_vpc_ipv6 ? aws_vpc.vpc.ipv6_cidr_block : null
  description = "VPC IPv6 CIDR block"
}

output "public_subnet_ids" {
  value       = aws_subnet.public.*.id
  description = "VPC public subnet ids"
}

output "private_subnet_ids" {
  value       = aws_subnet.private.*.id
  description = "VPC private subnet ids"
}

output "database_subnet_ids" {
  value       = aws_subnet.database.*.id
  description = "VPC database subnet ids"
}

output "aws_db_subnet_group_name" {
  value       = length(var.database_ipv4_subnets) > 0 ? aws_db_subnet_group.db_subnet_group[0].name : null
  description = "VPC database subnet group name"
}
