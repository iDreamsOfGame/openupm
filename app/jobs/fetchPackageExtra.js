/**
 * Fetch package extra data
 **/

const cheerio = require("cheerio");
const config = require("config");
const urljoin = require("url-join");
const packageExtra = require("../models/packageExtra");
const {
  loadPackageNames,
  loadPackage,
  packageExists
} = require("../utils/package");
const { AxiosService } = require("../utils/http");
const logger = require("../utils/log")(module);

/**
 * Fetch package extra data into redis for given packageNames array.
 * @param {Array} packageNames
 */
const fetchExtraData = async function(packageNames) {
  logger.info("fetchExtraData");
  if (!packageNames) packageNames = [];
  for (let packageName of packageNames) {
    // Verify package
    if (!packageExists(packageName)) {
      logger.error({ pkg: packageName }, "package doesn't exist");
      continue;
    }
    // Load package
    const pkg = await loadPackage(packageName);
    await _fetchUpdatedTime(packageName);
    await _fetchUnityVersion(packageName);
    await _fetchStars(pkg.repo, packageName);
    await _fetchOGImage(pkg, packageName);
    await _fetchReadme(pkg.repo, packageName);
  }
};

/**
 * Fetch Unity version.
 * @param {string} repo
 * @param {string} packageName
 */
const _fetchUnityVersion = async function(packageName) {
  try {
    const resp = await AxiosService.create().get(
      urljoin("https://package.openupm.com", packageName),
      {
        headers: { Accept: "application/json" }
      }
    );
    const pkgInfo = resp.data;
    const version = pkgInfo["dist-tags"].latest;
    const versionInfo = pkgInfo.versions[version];
    const unity = versionInfo.unity;
    if (unity) await packageExtra.setUnityVersion(packageName, unity);
  } catch (error) {
    const is404 = error.response && error.response.status == 404;
    if (!is404) logger.error(error);
  }
};

/**
 * Fetch repository stars.
 * @param {string} repo
 */
const _fetchStars = async function(repo, packageName) {
  try {
    const headers = { Accept: "application/vnd.github.v3.json" };
    if (config.gitHub.token)
      headers.authorization = `Bearer ${config.gitHub.token}`;
    const resp = await AxiosService.create().get(
      urljoin("https://api.github.com/repos/", repo),
      { headers }
    );
    const repoInfo = resp.data;
    let stars = 0;
    stars += repoInfo.stargazers_count || 0;
    stars += (repoInfo.parent && repoInfo.parent.stargazers_count) || 0;
    await packageExtra.setStars(packageName, stars);
  } catch (error) {
    console.error(error);
  }
};

/**
 * Fetch repository og:image.
 * @param {string} repo
 * @param {*} packageName
 */
const _fetchOGImage = async function(pkg, packageName) {
  // Helper method to fetch og:image.
  const _fetchOGImageForRepo = async function(repo) {
    try {
      const url = urljoin("https://github.com/", repo);
      const resp = await AxiosService.create().get(url);
      const text = resp.data;
      const $ = cheerio.load(text);
      let ogImageUrl = $("meta[property='og:image']").attr("content");
      if (/^https:\/\/avatar/.test(ogImageUrl)) {
        ogImageUrl = "";
      }
      return ogImageUrl;
    } catch (error) {
      console.error(error);
      return "";
    }
  };
  // Fetch from repo.
  let imageUrl = await _fetchOGImageForRepo(pkg.repo);
  // Fetch from parent repo.
  if (!imageUrl && pkg.parentRepo) {
    imageUrl = await _fetchOGImageForRepo(pkg.parentRepo);
  }
  // Save it.
  try {
    await packageExtra.setImageUrl(packageName, imageUrl);
  } catch (error) {
    console.error(error);
  }
};

/**
 * Fetch repository readme.
 * @param {string} repo
 */
const _fetchReadme = async function(repo, packageName) {
  try {
    const headers = { Accept: "application/vnd.github.v3.raw" };
    if (config.gitHub.token)
      headers.authorization = `Bearer ${config.gitHub.token}`;
    const resp = await AxiosService.create().get(
      urljoin("https://api.github.com/repos/", repo, "readme"),
      { headers }
    );
    const text = resp.data;
    await packageExtra.setReadme(packageName, text);
  } catch (error) {
    console.error(error);
  }
};

/**
 * Fetch package's last updated time from registry.
 * @param {string} packageName
 */
const _fetchUpdatedTime = async function(packageName) {
  try {
    const resp = await AxiosService.create().get(
      urljoin("https://package.openupm.com/", packageName),
      {
        headers: { Accept: "application/json" }
      }
    );
    const data = resp.data || {};
    const version = (data["dist-tags"] || {}).latest;
    const timeStr = (data.time || {})[version] || 0;
    const time = new Date(timeStr).getTime();
    await packageExtra.setUpdatedTime(packageName, time);
  } catch (error) {
    console.error(error);
  }
};

/**
 * Aggregate extra data for all packages into redis.
 */
const aggregateExtraData = async function() {
  logger.info("aggregateExtraData");
  const packageNames = await loadPackageNames();
  const aggData = {};
  for (let packageName of packageNames) {
    // Verify package
    if (!packageExists(packageName)) {
      logger.error({ pkg: packageName }, "package doesn't exist");
      continue;
    }
    const data = {};
    const stars = await packageExtra.getStars(packageName);
    data.stars = stars || 0;
    const unity = await packageExtra.getUnityVersion(packageName);
    data.unity = unity || "2018.1";
    const imageUrl = await packageExtra.getImageUrl(packageName);
    data.imageUrl = imageUrl || undefined;
    const updatedTime = await packageExtra.getUpdatedTime(packageName);
    data.time = updatedTime || undefined;
    aggData[packageName] = data;
  }
  await packageExtra.setAggregatedExtraData(aggData);
};

if (require.main === module) {
  let program = require("../utils/commander");
  let packageNames = null;
  program
    .option("--all", "fetch extra package data for all packages")
    .arguments("[name...]")
    .action(function(names) {
      packageNames = names;
    })
    .parse(process.argv)
    .run(async function() {
      if (program.all) packageNames = await loadPackageNames();
      if (packageNames === null || !packageNames.length) program.help();
      await fetchExtraData(packageNames);
      await aggregateExtraData();
    });
}
