import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDepositDto {
  @IsNumber()
  amountRub: number;

  @IsString()
  @IsOptional()
  currency?: string;
}
