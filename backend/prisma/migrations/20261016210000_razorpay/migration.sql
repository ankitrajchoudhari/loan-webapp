-- Online payments through a gateway (Razorpay): confirmed automatically after the signature check
ALTER TABLE "payments" ADD COLUMN "gateway" VARCHAR(20);
ALTER TABLE "payments" ADD COLUMN "gateway_order_id" VARCHAR(60);
ALTER TABLE "payments" ADD COLUMN "gateway_payment_id" VARCHAR(60);
CREATE UNIQUE INDEX "payments_gateway_order_id_key" ON "payments"("gateway_order_id");
CREATE UNIQUE INDEX "payments_gateway_payment_id_key" ON "payments"("gateway_payment_id");
ALTER TABLE "payments" DROP CONSTRAINT "payments_method_ok";
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_ok" CHECK ("method" IN ('upi', 'cash', 'online'));
