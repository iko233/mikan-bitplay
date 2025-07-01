蜜柑计划调用bitplay实现iina/potplayer在线播放油猴脚本
感谢bitplay项目，服务器端：https://github.com/aculix/bitplay

```shell
docker run -d \
  --name bitplay \
  -p 3347:3347 \
  -v $(pwd)/torrent-data:/app/torrent-data
  -v $(pwd)/config:/app/config \
  --restart unless-stopped \
  ghcr.io/aculix/bitplay:main
```
![image](https://github.com/user-attachments/assets/2915dbda-c87d-4583-bee8-4f8a53f5db2e)

![image](https://github.com/user-attachments/assets/8deaa8fb-6162-4cc6-9276-94b3129f4d75)



---------------------------------
优化项：
  1.bitplay在调用/add接口后可用于播放的stream链接大概只有20分钟的存活期,可以配置Cloudfalre缓存对`https://{$host}/api/v1/torrent/*/stream/*/*.mp4`进行缓存可以解决这个问题
  2.bitplay的在线播放按钮和下载按钮都是唤起另一个页面打开`https://{$host}/api/v1/torrent/*/stream`接口的逻辑，由于bitplay没有返回Content-Disposition，默认逻辑都是从当前浏览器播放，如果使用Cloudfalre的缓存过后，Cloudfalre会默认增加`Content-Disposition：attachment`响应头导致会执行下载行为，因此需要配置Cloudfalre的响应标头转换规则,对路径`https://{$host}/api/v1/torrent/*/stream/*/*.mp4`增加响应头`Content-Disposition：attachment`,`Content-Type: video/mp4`，对路径`https://{$host}/api/v1/torrent/*/stream/*/stream.mp4`增加响应头`Content-Disposition：inline`,`Content-Type: video/mp4`
