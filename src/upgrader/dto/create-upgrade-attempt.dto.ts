import { IsIn, IsInt, Min } from 'class-validator';
import { UPGRADE_CHANCE_TIERS } from './list-upgrade-options.dto';
import type { UpgradeChanceTier } from './list-upgrade-options.dto';

export class CreateUpgradeAttemptDto {
  @IsInt()
  @Min(1)
  inventoryItemId: number;

  @IsInt()
  @Min(1)
  targetSkinId: number;

  @IsInt()
  @IsIn(UPGRADE_CHANCE_TIERS)
  chance: UpgradeChanceTier;
}
