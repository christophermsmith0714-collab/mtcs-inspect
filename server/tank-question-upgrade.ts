import crypto from "node:crypto";
import { tankQuestions } from "@shared/tank-checklist";

// Match only the unedited first-release wording. Preserve IDs, saved answers,
// recommendation text, ordering and administrator customizations.
const previousQuestions: Record<string, number> = {
  "91fcd35e40a1fc55d415d632f225991ed33eef36c7e54100864fc48e5f742015": 0,
  "c1e540483080981e3e4b9db6c6cace637f314e1fb9a39264bb287377a0d8de58": 1,
  "bb998142b3c892445ad29391ab1498e7882ef39d03c81588f2f85917ca94f7ba": 2,
  "a3ca67c1aa33c998969437f8715b5587cf9a2768f063009091aad2d5eccd2ef3": 3,
  "f82f44c860ca6de0f1876bb8c96aedaeca089fb4b763b90c89b94ca84a175469": 4,
  "4839fee94cfa680a5889fa7ed4268579eb2366c763999957be0719d447add9ca": 5,
  "aade38278436b7b7a97c1f148021edbdbfcbb2b928f2da8fd5a80ea747cabcf5": 6,
  "f2e0c2d83c85c3109cf48cc06811594e379e9c6b3c75172567408fff609dd6d4": 7,
  "ac8b5d0ea241f27c7f3a11b65c85531a28c7b450710e7dea9302a3914dae435d": 8,
  "735a0b2361579ef3a2db99dc55b2233aac878dfa6a421d8ecadbfd27b0cdfa46": 9,
  "1ee0b747d90047052177fc158be755a551d62c786f87a2b61bdd2b5c05776508": 10,
  "9ba3eb4550e7dc35b7feff58319d2a20d4cf3f43eb760ee4ef4ddae751641bb4": 11,
  "d5f437e8f8ba0a2e7e63d87f4e1efc475724aad2d8e78a64a1c508c57ea16dad": 12,
  "1178f8e0eec0c5d3ad69990d6380bd48c385a42eb89bfd223c3ab44b6763ad35": 13,
  "7be7f6987261421d67ba8ccd1f91c4c734f6ffe7ee7948b0b1cebf9ff9cf81c4": 14,
  "e5d727c9882f64071b7ca6b7353c03993f342d9434dbc859158bc0e786736ce3": 15,
  "80032d8695af1ac95fe47debee92bf275c62bc20afe0eba51fcb3e437584908c": 16,
  "8c57202b5ffb4f3756974e5709c8ade06eb8e54543d5916855c617b03d67dcac": 17,
  "cae04048b1961a267d8d0accec82514992ad763aa3ffbc00fe204eb19d116959": 18,
  "660eec03332ca03eaca820783b5fa2f8894fc162046b420dd3723c41d0008ad5": 19,
  "d29a346663aefc4adb321d354dbc7ad96101e751f45c6214e03346e800f9de63": 20,
  "67e95e7c0a4abffa2f3244d8057778955d1c8483f66ff036b3b3474a462582ea": 21,
  "224745b96c3fc0f96b628a68d522ace42e81bf308daa98ac7af229e3573bebcc": 22,
  "420c2da9c303f3f6125cd6ec8e0553e5ca79b49769738136812f79c91cccf70e": 23,
  "0bdc77d2df02de41bfc48aa86f2ea4869cc4194a8d7cec2167fc3070d56a24b9": 24,
  "950c14bc7d1cf09884f32afc68286ea72bcfe162676b6524e631d7aa6e06b785": 25,
  "5d7fdb4a584bee904e378d9fa916e8b461bd87d75abd1449463b033a1d4aad1d": 26,
  "9ed10a2fc8dd8ddb4428b991b28a0fa5a0d4352bf0cf55c7c9f76d954a18106f": 27,
  "a30e3874e88f95683e5dc875315f16d10c0c79f91c03f12c8deff6b67cead101": 28,
  "6fac5662ffefafeea94111b48463e99745ae6dbbed276f8719efba9beb054b85": 29,
  "b3ff293114f469234dc2bbad00da511b99b7a3b2172cc49509c2976cc9d705ea": 30,
  "5fa40c71a966b36118964d3a9dec67626ac87e99e4eb4a37f82b014b6943a3c2": 31
};

export function revisedTankQuestion(question: { section: string; questionText: string }) {
  const digest = crypto.createHash("sha256").update(question.section + "\n" + question.questionText).digest("hex");
  const index = previousQuestions[digest];
  if (index === undefined) return undefined;
  const revised = tankQuestions[index];
  return { section: revised.section, questionText: revised.questionText };
}
