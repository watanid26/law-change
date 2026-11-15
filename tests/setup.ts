// vitest 실행 최상단 setup — 모든 test import 전에 .env.local 로드
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
