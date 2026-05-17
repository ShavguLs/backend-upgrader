import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTradeUrlDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  steamTradeUrl: string;
}
