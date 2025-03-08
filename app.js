document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.querySelector('.login');
    const signupForm = document.querySelector('#submit-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function (event) {
            event.preventDefault(); 

            const username = document.getElementById('userinputname').value;
            const password = document.getElementById('userpassname').value;

            fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.location.href = `welcome.html?username=${username}`;
                } else {
                    alert(data.message);
                }
            })
            .catch(error => {
                alert('Error logging in: ' + error.message);
            });
        });
    } else {
        console.error('Login form not found in the DOM');
    }

    if (signupForm) {
        signupForm.addEventListener('click', function (event) {
            event.preventDefault(); 

            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('password').value;
            const gender = document.getElementById('gender').value;
            const dob = document.getElementById('dob').value;
            const profession = document.getElementById('profession').value;
            const address = document.getElementById('address').value;

            fetch('/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, phone, password, gender, dob, profession, address })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('User created successfully!');
                } else {
                    alert(data.message);
                }
            })
            .catch(error => {
                alert('Error creating user: ' + error.message);
            });
        });
    } else {
        console.error('Signup form not found in the DOM');
    }



    const postForm = document.getElementById('postFormElement');
    const postsContainer = document.getElementById('posts');

    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(postForm);
        try {
            const response = await fetch('/api/posts', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                alert('Post created successfully!');
                fetchPosts();
            } else {
                alert('Failed to create post: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });

    const fetchPosts = async () => {
        try {
            const response = await fetch('/api/posts');
            const posts = await response.json();
            postsContainer.innerHTML = posts.map(post => {
                const images = post.imageFiles.map(file => `<img src="/files/${file.filename}" alt="${file.filename}">`).join('');
                const videos = post.videoFiles.map(file => `<video controls src="/files/${file.filename}"></video>`).join('');
                return `
                    <div class="post">
                        <p>${post.text}</p>
                        ${images}
                        ${videos}
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error fetching posts:', error);
        }
    };

    fetchPosts();
});
