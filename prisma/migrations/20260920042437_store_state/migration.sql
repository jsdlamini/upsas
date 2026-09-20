-- CreateTable
CREATE TABLE "StoreState" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreState_pkey" PRIMARY KEY ("key")
);
