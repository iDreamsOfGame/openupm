<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="package-recent container">
    <div class="columns">
      <div class="column col-12 col-sm-12">
        <masonry :cols="{ default: 3, 840: 2, 600: 1 }" :gutter="16">
          <div v-for="pkg in packages" :key="pkg.id">
            <PackageCard :item="pkg" :show-created-at="true" />
          </div>
        </masonry>
      </div>
    </div>
  </div>
</template>

<script>
import PackageCard from "@theme/components/PackageCard.vue";
import util from "@root/docs/.vuepress/util";

export default {
  components: { PackageCard },
  props: {
    count: {
      type: Number,
      default: 3
    }
  },
  data() {
    return {};
  },
  computed: {
    packagesExtra() {
      return this.$store.getters.packagesExtra;
    },
    packages() {
      const pkgs = this.$page.recentPackages.slice(0, this.count).map(x => {
        return util.joinPackageExtra(x, this.packagesExtra[x.name] || {});
      });
      return pkgs;
    }
  }
};
</script>

<style lang="stylus">
.package-recent
  margin-top 1rem
</style>
