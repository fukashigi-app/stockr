export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { name, dob, gender, plan, cat, worry } = req.body;

  return res.status(200).json({
    result:
      `${name}さんへ\n\n` +
      `${cat}について、今は流れが少しずつ整っていく時期です。\n` +
      `焦って大きく動くよりも、小さな選択を丁寧に積み重ねることで運気が開いていきます。\n\n` +
      `特に今は「迷った時ほど、身近な人の言葉」にヒントがあります。`
  });
}
