import { IsInt, Min } from 'class-validator';

export class WithdrawInventoryItemDto {
  @IsInt()
  @Min(1)
  inventoryItemId: number;
}
