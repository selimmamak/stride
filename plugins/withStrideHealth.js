const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

module.exports = function withStrideHealth(config) {
  config = withEntitlementsPlist(config, (result) => {
    result.modResults["com.apple.developer.healthkit"] = true;
    return result;
  });
  return withInfoPlist(config, (result) => {
    result.modResults.NSHealthShareUsageDescription =
      "Stride reads running workouts and their distance from Apple Health to add them to your running log. Imported runs stay on this phone.";
    return result;
  });
};
