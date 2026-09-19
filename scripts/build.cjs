// 打包：先检查，再构建、打包；发布正式版成功后自动打上 v 版本号的标记
// 用法：node scripts/build.cjs beta | dist | release
//   beta     测试版安装包 → release/test/，不发布；版本号必须带预发布号（如 1.1.0-beta.1）
//   dist     正式版安装包 → release/，不发布；只能在 main 分支
//   release  正式版打包并发布到 GitHub；只能在 main 分支、改动都已提交
const { execSync } = require('child_process')
const path = require('path')
const pkg = require('../package.json')

const mode = process.argv[2]
const version = pkg.version
const prerelease = version.includes('-')
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim()
const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

if (mode === 'beta') {
  // 程序靠预发布号决定用测试的数据文件夹；没有它，测试版会用到正式版里的真实日程
  if (!prerelease) fail(`测试版的版本号要带预发布号，比如 ${version}-beta.1（现在是 ${version}）`)
} else if (mode === 'dist' || mode === 'release') {
  if (prerelease) fail(`正式版的版本号不能带预发布号（现在是 ${version}）。先在 package.json 里改成正式的版本号`)
  const branch = git('rev-parse --abbrev-ref HEAD')
  if (branch !== 'main') fail(`正式版只从 main 分支打包（现在在 ${branch}）。先把 dev 合并到 main 再切过去`)
  if (mode === 'release') {
    if (git('status --porcelain')) fail('还有没提交的改动。正式版要和某一次提交完全对应，先提交')
    if (git(`tag --list v${version}`)) fail(`v${version} 已经发布过了，先改版本号`)
    if (!process.env.GH_TOKEN) fail('没有找到 GH_TOKEN 环境变量，发布不到 GitHub')
  }
} else {
  fail('用法：node scripts/build.cjs beta | dist | release')
}
console.log(`✓ ${mode === 'beta' ? '测试版' : '正式版'} ${version}，检查通过\n`)

// electron-builder 要调用 PowerShell；有的电脑 PATH 里没有它的目录，这里补上
const root = process.env.SystemRoot || 'C:\\Windows'
const env = {
  ...process.env,
  PATH: [path.join(root, 'System32', 'WindowsPowerShell', 'v1.0'), path.join(root, 'System32'), process.env.PATH].join(path.delimiter)
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env })

run('npx electron-vite build')
const publish = mode === 'release' ? 'always' : 'never'
run(`npx electron-builder --win --publish ${publish}${mode === 'beta' ? ' --config electron-builder.test.yml' : ''}`)

if (mode === 'release') {
  git(`tag -a v${version} -m "简程 ${version}（已发布）"`)
  console.log(`\n✓ 已发布 ${version}，并打上标记 v${version}`)
} else {
  console.log(`\n✓ 安装包在 ${mode === 'beta' ? 'release/test/' : 'release/'}`)
}
