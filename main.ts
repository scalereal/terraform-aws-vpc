//
//Copyright © 2024 ScaleReal Technologies Pvt Ltd.
//
// SPDX-License-Identifier: BSD 3-Clause
//

import { Construct } from "constructs";
import { TerraformOutput, Fn, TerraformIterator } from "cdktf";
import { Eip } from "@cdktf/provider-aws/lib/eip";
import { DataAwsCallerIdentity } from "@cdktf/provider-aws/lib/data-aws-caller-identity";
import { Subnet } from "@cdktf/provider-aws/lib/subnet";
import { InternetGateway } from "@cdktf/provider-aws/lib/internet-gateway";
import { NatGateway } from "@cdktf/provider-aws/lib/nat-gateway";
import { Vpc } from "@cdktf/provider-aws/lib/vpc";
import { EgressOnlyInternetGateway } from "@cdktf/provider-aws/lib/egress-only-internet-gateway";
import { RouteTable } from "@cdktf/provider-aws/lib/route-table";
import { RouteTableAssociation } from "@cdktf/provider-aws/lib/route-table-association";
import { Route } from "@cdktf/provider-aws/lib/route";
import { DataAwsAvailabilityZones } from "@cdktf/provider-aws/lib/data-aws-availability-zones";
import { Op } from "cdktf";
import { StaticResource } from "@cdktf/provider-time/lib/static-resource";
import { TimeProvider } from "@cdktf/provider-time/lib/provider";

export interface VpcModuleConfig {
  cidr: string;
  service_name: string;
  env: string;
  enable_private_subnets?: boolean;
  enable_database_subnets?: boolean;
  enable_ip4_nat?: boolean;
  enable_ip6_egw?: boolean;
  tags?: { [key: string]: string };
}

export class VpcModule extends Construct {
  public readonly vpc: Vpc;
  private natGw?: NatGateway;
  private egw?: EgressOnlyInternetGateway;
  public readonly public_subnet_it: TerraformIterator;
  public readonly private_subnet_it?: TerraformIterator;
  public readonly database_subnet_it?: TerraformIterator;
  
  constructor(scope: Construct, name: string, config: VpcModuleConfig) {
    super(scope, name);

    const {
      cidr,
      service_name,
      env,
      enable_private_subnets = false,
      enable_database_subnets = false,
      enable_ip4_nat = false,
      enable_ip6_egw = false,
      tags = {},
    } = config;

    const azs = new DataAwsAvailabilityZones(this, "azs", {
      state: "available",
    });

    // Create iterator for AZs
    const azIterator = TerraformIterator.fromList(azs.names);

    const caller = new DataAwsCallerIdentity(this, "current");
    
    const time_static = new StaticResource(this, "timestamp");
    
    const vpc_name = `${service_name}_${env}_vpc`;

    const defaultTags = {
      Name: vpc_name,
      Service: service_name,
      ENV: env,
      Provisioner: "CDKTF",
      "Provisioned By": caller.userId,
      "Provisioned Date": time_static.id,
      ...tags,
    };

    new TimeProvider(this, "time", {});

    this.vpc = new Vpc(this, "vpc", {
      cidrBlock: cidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      assignGeneratedIpv6CidrBlock: true,
      tags: defaultTags,
    });

    const numOfSubnetTypes = 1 + 
      (enable_private_subnets ? 1 : 0) + 
      (enable_database_subnets ? 1 : 0);
    const newBits = Fn.ceil(Fn.log(Op.mul(numOfSubnetTypes, Fn.lengthOf(azs.names)), 2));
  
    // Create public subnets
    const public_subnet = new Subnet(this, "public-subnet", {
      forEach: azIterator,
      vpcId: this.vpc.id,
      cidrBlock: Fn.cidrsubnet(cidr, newBits, Op.add(Fn.index(azs.names, azIterator.key), 1)),
      ipv6CidrBlock: Fn.cidrsubnet(this.vpc.ipv6CidrBlock, 8, Op.add(Fn.index(azs.names, azIterator.key), 1)),
      assignIpv6AddressOnCreation: true,
      availabilityZone: azIterator.value,
      mapPublicIpOnLaunch: true,
      tags: {
        ...defaultTags,
        Name: `${vpc_name}-public-${Fn.element(Fn.split("-", azIterator.value), 2)}`,
      },
    });
    
    this.public_subnet_it = TerraformIterator.fromResources(public_subnet);
    // Create private subnets
    if (enable_private_subnets) {
      const private_subnet = new Subnet(this, "private-subnet", {
        forEach: azIterator,
        vpcId: this.vpc.id,
        cidrBlock: Fn.cidrsubnet(cidr, newBits, 
          Op.add(Op.add(Fn.index(azs.names, azIterator.key), 1), Fn.lengthOf(azs.names))),
        ipv6CidrBlock: Fn.cidrsubnet(this.vpc.ipv6CidrBlock, 8, 
          Op.add(Op.add(Fn.index(azs.names, azIterator.key), 1), Fn.lengthOf(azs.names))),
        assignIpv6AddressOnCreation: true,
        availabilityZone: azIterator.value,
        tags: {
          ...defaultTags,
          Name: `${vpc_name}-private-${Fn.element(Fn.split("-", azIterator.value), 2)}`,
        },
      });
      this.private_subnet_it = TerraformIterator.fromResources(private_subnet);
    }

    // Create database subnets
    if (enable_database_subnets) {
      const database_subnet = new Subnet(this, "database-subnet", {
        forEach: azIterator,
        vpcId: this.vpc.id,
        cidrBlock: Fn.cidrsubnet(cidr, newBits, 
          Op.add(Op.add(Fn.index(azs.names, azIterator.key), 1), Op.mul(2, Fn.lengthOf(azs.names)))),
        ipv6CidrBlock: Fn.cidrsubnet(this.vpc.ipv6CidrBlock, 8, 
          Op.add(Op.add(Fn.index(azs.names, azIterator.key), 1), Op.mul(2, Fn.lengthOf(azs.names)))),
        assignIpv6AddressOnCreation: true,
        availabilityZone: azIterator.value,
        tags: {
          ...defaultTags,
          Name: `${vpc_name}-database-${Fn.element(Fn.split("-", azIterator.value), 2)}`,
        },
      });
      this.database_subnet_it = TerraformIterator.fromResources(database_subnet);
    }

    const igw = new InternetGateway(this, "igw", {
      vpcId: this.vpc.id,
      tags: defaultTags,
    });

    // Create route tables and routes
    const public_route_table = new RouteTable(this, "public-rt", {
      vpcId: this.vpc.id,
      tags: {
        ...defaultTags,
        Name: `${vpc_name}-public-rt`,
      },
    });

    new Route(this, "public-route", {
      routeTableId: public_route_table.id,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: igw.id,
    });

    new Route(this, "public-route-ipv6", {
      routeTableId: public_route_table.id,
      destinationIpv6CidrBlock: "::/0",
      gatewayId: igw.id,
    });

    // Associate public subnets with route table
    new RouteTableAssociation(this, "public-rta", {
      forEach: this.public_subnet_it,
      subnetId: this.public_subnet_it.getString("id"),
      routeTableId: public_route_table.id,
    });

    if (enable_private_subnets) {
      const private_route_table = new RouteTable(this, "private-rt", {
        vpcId: this.vpc.id,
        tags: {
          ...defaultTags,
          Name: `${vpc_name}-private-rt`,
        },
      });

      if (enable_ip4_nat) {
        const eip = new Eip(this, "nat-eip", {
          tags: defaultTags,
        });

        this.natGw = new NatGateway(this, "nat-gw", {
          allocationId: eip.id,
          subnetId: Fn.element(this.public_subnet_it.pluckProperty("id"), 0),
          tags: defaultTags,
        });

        new Route(this, "private-nat-route", {
          routeTableId: private_route_table.id,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: this.natGw.id,
        });
      }

      if (enable_ip6_egw) {
        this.egw = new EgressOnlyInternetGateway(this, "egw", {
          vpcId: this.vpc.id,
          tags: defaultTags,
        });

        new Route(this, "private-ipv6-route", {
          routeTableId: private_route_table.id,
          destinationIpv6CidrBlock: "::/0",
          egressOnlyGatewayId: this.egw.id,
        });
      }

      // Associate private subnets with route table
      if (this.private_subnet_it) {
        new RouteTableAssociation(this, "private-rta", {
          forEach: this.private_subnet_it,
          subnetId: this.private_subnet_it.getString("id"),
          routeTableId: private_route_table.id,
        });
      }
    }

    if (enable_database_subnets) {
      const database_route_table = new RouteTable(this, "database-rt", {
        vpcId: this.vpc.id,
        tags: {
          ...defaultTags,
          Name: `${vpc_name}-database-rt`,
        },
      });

      // Associate database subnets with route table
      if (this.database_subnet_it) {
        new RouteTableAssociation(this, "database-rta", {
          forEach: this.database_subnet_it,
          subnetId: this.database_subnet_it.getString("id"),
          routeTableId: database_route_table.id,
        });
      }
    }

    // Outputs
    new TerraformOutput(this, "vpc_id", {
      value: this.vpc.id,
    });

    new TerraformOutput(this, "vpc_cidr", {
      value: this.vpc.cidrBlock,
    });

    new TerraformOutput(this, "vpc_ipv6_cidr", {
      value: this.vpc.ipv6CidrBlock,
    });

    new TerraformOutput(this, "public_subnet_ids", {
      value: this.public_subnet_it.pluckProperty("id"),
    });
    
    if (enable_private_subnets && this.private_subnet_it) {
      new TerraformOutput(this, "private_subnet_ids", {
        value: this.private_subnet_it.pluckProperty("id"),
      });
    }
    
    if (enable_database_subnets && this.database_subnet_it) {
      new TerraformOutput(this, "database_subnet_ids", {
        value: this.database_subnet_it.pluckProperty("id"),
      });
    }
  }
}
