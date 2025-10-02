<template>
  <private-view :title="pageTitle">
    <template #headline>
      <div class="chat-header">
        <span class="chat-title">Message</span>
        <div class="chat-actions">
          <v-icon name="group" />
          <v-icon name="search" />
          <v-icon name="more_vert" />
        </div>
      </div>
    </template>
    <template #navigation>
      <!-- Danh sách hội thoại -->
      <div class="chat-nav">
        <div class="nav-search">
          <input placeholder="Search conversation" v-model="search" />
        </div>
        <div class="nav-list">
          <div
            v-for="conv in filteredConversations"
            :key="conv.id"
            class="nav-item"
            :class="{ active: conv.id === activeConv }"
            @click="activeConv = conv.id"
          >
            <img :src="conv.avatar" class="avatar" />
            <div class="conv-info">
              <div class="conv-name">{{ conv.name }}</div>
              <div class="conv-last">{{ conv.lastMsg }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #sidebar>
      <!-- Sidebar có thể để thông tin thành viên hoặc shortcut -->
      <div class="chat-sidebar">
        <div v-if="activeConvObj">
          <img :src="activeConvObj.avatar" class="sidebar-avatar" />
          <div class="sidebar-name">{{ activeConvObj.name }}</div>
          <div class="sidebar-status">Online</div>
        </div>
      </div>
    </template>
    <div class="chat-main">
      <div class="messages">
        <div
          v-for="(msg, i) in conversationMessages"
          :key="i"
          class="msg"
          :class="{ 'msg-me': msg.me }"
        >
          <img v-if="!msg.me" :src="activeConvObj.avatar" class="msg-avatar" />
          <div class="msg-content">
            <span class="msg-author">{{ msg.me ? 'Me' : activeConvObj.name }}</span>
            <span class="msg-text">{{ msg.text }}</span>
          </div>
        </div>
      </div>
      <div class="chat-input">
        <input
          v-model="chatText"
          @keyup.enter="sendMsg"
          placeholder="Type your message here..."
        />
        <v-icon name="send" @click="sendMsg" />
      </div>
    </div>
  </private-view>
</template>

<script>
import { ref, computed } from 'vue';
export default {
  setup() {
    const pageTitle = ref('Message');
    const search = ref('');
    const chatText = ref('');
    const activeConv = ref(1);
    const conversations = ref([
      {
        id: 1,
        name: 'Olivia Rhye',
        avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
        lastMsg: 'Hi Khuyen, do you have a moment?',
      },
      {
        id: 2,
        name: 'Adam Levine',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
        lastMsg: 'There are many variati...',
      },
      {
        id: 3,
        name: 'Wilson Press',
        avatar: 'https://randomuser.me/api/portraits/men/29.jpg',
        lastMsg: 'How far along...',
      },
    ]);
    const allMessages = ref({
      1: [
        { me: false, text: 'Hi Khuyen, do you have a moment to talk about the new project?' },
        { me: true, text: "Sure, Olivia. What's on your mind?" },
        { me: false, text: "I've just reviewed the client's requirements..." },
      ],
      2: [
        { me: false, text: 'There are many variati...' },
        { me: true, text: 'Thanks Adam.' },
      ],
      3: [
        { me: false, text: 'How far along?' },
        { me: true, text: 'About 70%.' },
      ],
    });

    const activeConvObj = computed(() =>
      conversations.value.find((c) => c.id === activeConv.value)
    );
    const conversationMessages = computed(() =>
      allMessages.value[activeConv.value] || []
    );
    const filteredConversations = computed(() =>
      conversations.value.filter((c) =>
        c.name.toLowerCase().includes(search.value.toLowerCase())
      )
    );
    function sendMsg() {
      if (chatText.value) {
        allMessages.value[activeConv.value].push({ me: true, text: chatText.value });
        chatText.value = '';
      }
    }
    return {
      pageTitle,
      search,
      chatText,
      activeConv,
      filteredConversations,
      activeConvObj,
      conversationMessages,
      sendMsg,
    };
  },
};
</script>

<style lang="scss">
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.5em;
}
.chat-actions {
  display: flex;
  gap: 18px;
}
.chat-nav {
  width: 260px;
  padding: 12px 0;
  border-right: 1px solid #eee;
  background: #f7f8fc;
  height: 100%;
}
.nav-search {
  padding: 0 12px 8px 12px;
}
.nav-list {
  max-height: 75vh;
  overflow-y: auto;
}
.nav-item {
  cursor: pointer;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 18px;
  transition: background 0.2s;
}
.nav-item.active, .nav-item:hover {
  background: #eee;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}
.conv-info { flex: 1; min-width: 0; }
.conv-name { font-weight: 600; }
.conv-last { font-size: 0.9em; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-main {
  min-height: 350px;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background: #fff;
}
.messages {
  flex: 1;
  margin-bottom: 24px;
  overflow-y: auto;
  max-height: 56vh;
}
.msg {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10px;
}
.msg-me {
  flex-direction: row-reverse;
  .msg-content {
    background: #2d72fa;
    color: white;
  }
}
.msg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  margin: 0 8px;
}
.msg-content {
  background: #f0f2f8;
  border-radius: 12px;
  padding: 8px 10px;
  max-width: 56%;
  min-width: 80px;
  word-break: break-word;
  margin: 0 6px;
  font-size: 1.02em;
  line-height: 1.275em;
}
.msg-author {
  font-weight: 600;
  font-size: 0.98em;
  margin-right: 4px;
}
.chat-input {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid #eee;
  padding: 12px 0;
  background: #f9fbff;
  input {
    flex: 1;
    padding: 8px 12px;
    font-size: 1.04em;
    border-radius: 6px;
    border: 1px solid #ccc;
  }
}
.chat-sidebar {
  border-left: 1px solid #eee;
  padding: 18px;
  background: #fcfdff;
  min-width: 140px;
  text-align: center;
}
.sidebar-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}
.sidebar-name { font-size: 1.09em; font-weight: bold; margin-top: 10px; }
.sidebar-status { color: #00a43a; font-size: 0.95em; margin-top: 2px; }
</style>
