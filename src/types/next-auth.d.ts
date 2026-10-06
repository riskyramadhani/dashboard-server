import { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    employeeId: string;
    role: Role;
    allowedProbes: string[];
  }

  interface Session {
    user: User & {
      id: string;
      employeeId: string;
      role: Role;
      allowedProbes: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    employeeId: string;
    role: Role;
    allowedProbes: string[];
  }
}
