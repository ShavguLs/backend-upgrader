import { IsInt, Min } from 'class-validator';

export class SellInventoryItemDto {
  @IsInt()
  @Min(1)
  inventoryItemId: number;
}
