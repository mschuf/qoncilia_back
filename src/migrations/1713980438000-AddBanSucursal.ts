import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBanSucursal1713980438000 implements MigrationInterface {
  name = "AddBanSucursal1713980438000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bancos" ADD COLUMN IF NOT EXISTS "ban_sucursal" character varying(120)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bancos" DROP COLUMN IF EXISTS "ban_sucursal"`
    );
  }
}
