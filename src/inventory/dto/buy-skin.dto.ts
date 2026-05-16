import { IsInt, Min } from 'class-validator';

export class BuySkinDto {
  @IsInt()
  @Min(1)
  skinId: number;
}
