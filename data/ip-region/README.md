# IP 地区数据

使用 [ip2region 官方免费 XDB](https://github.com/lionsoul2014/ip2region/tree/master/data)，来源版本 `c1a1fc7d5941760db3f8431dc05c48cf7f0e30a1`。数据仅用于近似网络出口归属，不代表实际位置。

二进制库不提交 Git；部署前在项目根目录下载（同时支持 IPv4 / IPv6）：

```sh
for version in 4 6; do
  curl --fail --location --retry 2 "https://raw.githubusercontent.com/lionsoul2014/ip2region/c1a1fc7d5941760db3f8431dc05c48cf7f0e30a1/data/ip2region_v${version}.xdb" --output "data/ip-region/ip2region_v${version}.xdb"
done
```

也可用 `IP_REGION_DATA_DIR` 指向外置目录。文件查询按需读取，不把整库载入内存。缺少或损坏的库会使统计接口返回错误，不会伪造地区；历史列表接口不依赖地区库。项目及数据的来源许可见 [官方 LICENSE](https://github.com/lionsoul2014/ip2region/blob/master/LICENSE.md)。
