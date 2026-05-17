import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

export const UPGRADE_CHANCE_TIERS = [10, 25, 50, 75] as const;

export type UpgradeChanceTier = (typeof UPGRADE_CHANCE_TIERS)[number];

export class ListUpgradeOptionsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inventoryItemId: number;

  @Type(() => Number)
  @IsInt()
  @IsIn(UPGRADE_CHANCE_TIERS)
  chance: UpgradeChanceTier;
}
