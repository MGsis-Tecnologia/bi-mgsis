// Re-export do cliente Prisma do catalog
// O cliente é gerado em node_modules/.prisma/catalog-client por prisma/catalog/schema.prisma
export { PrismaClient } from "../../../node_modules/.prisma/catalog-client";
export type { Prisma } from "../../../node_modules/.prisma/catalog-client";
